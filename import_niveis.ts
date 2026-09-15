import 'dotenv/config';
import fs from 'fs';
import { getDbPool } from './server/db.js';

interface RawItem {
  codigo_fabrica: string;
  baia: string;
  corredor: string;
  nivel: string;
  codigo_barras: string;
  origem: string;
}

function parseFile(filePath: string, label: string): RawItem[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const items: RawItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';').map(p => p.trim());
    const codOrig = parts[0] || '';
    const baia = parts[1] || '';
    const corredor = parts[2] || '';
    const nivel = parts[3] || '';
    const barcode = (parts[4] || '').replace(/\s+/g, '');

    if (!barcode && !codOrig) continue;

    items.push({
      codigo_fabrica: codOrig,
      baia,
      corredor,
      nivel,
      codigo_barras: barcode,
      origem: label,
    });
  }

  return items;
}

export async function importNiveis(dryRun = true) {
  console.log('--- CARGA DE DADOS: NIVEL 1 E NIVEL 2 ---');
  const items1 = parseFile('itens/NIVEL_1_COMPLETO.csv', 'Nivel 1');
  const items2 = parseFile('itens/NIVEL_2.csv', 'Nivel 2');
  console.log(`- NIVEL_1_COMPLETO.csv: ${items1.length} registros`);
  console.log(`- NIVEL_2.csv: ${items2.length} registros`);

  const allItems = [...items1, ...items2];
  console.log(`- Total bruto de registros para processar: ${allItems.length}`);

  const pool = getDbPool();
  if (!pool) {
    throw new Error('DATABASE_URL não configurada');
  }

  const client = await pool.connect();
  try {
    // Buscar produtos já existentes no banco
    const existingRes = await client.query('SELECT id, codigo_atual, codigo_barras_atual, codigo_fabrica, locacao FROM produtos');
    const existingByBarcode = new Map<string, any>();
    const existingByFactory = new Map<string, any>();

    for (const r of existingRes.rows) {
      if (r.codigo_barras_atual) existingByBarcode.set(r.codigo_barras_atual.toUpperCase(), r);
      if (r.codigo_fabrica) existingByFactory.set(r.codigo_fabrica.toUpperCase(), r);
    }

    console.log(`- Produtos atualmente no banco: ${existingRes.rows.length}`);

    // Desduplicar itens dentro do próprio lote (mantém o primeiro ou enriquece com localização se houver)
    const uniqueItemsMap = new Map<string, RawItem>();
    for (const item of allItems) {
      const key = item.codigo_barras ? item.codigo_barras.toUpperCase() : `FACTORY:${item.codigo_fabrica.toUpperCase()}`;
      if (!uniqueItemsMap.has(key)) {
        uniqueItemsMap.set(key, item);
      } else {
        // Se o anterior não tinha baia/corredor e o atual tem, atualiza
        const prev = uniqueItemsMap.get(key)!;
        if (!prev.corredor && !prev.baia && (item.corredor || item.baia)) {
          uniqueItemsMap.set(key, item);
        }
      }
    }

    const uniqueItems = Array.from(uniqueItemsMap.values());
    console.log(`- Itens únicos consolidados para importar: ${uniqueItems.length}`);

    let countNovos = 0;
    let countAtualizados = 0;
    let countSemLocacao = 0;

    const toInsert: any[] = [];
    const toUpdate: any[] = [];

    let nextId = existingRes.rows.length + 1;

    for (const item of uniqueItems) {
      const matchBar = item.codigo_barras ? existingByBarcode.get(item.codigo_barras.toUpperCase()) : null;
      const matchFac = item.codigo_fabrica ? existingByFactory.get(item.codigo_fabrica.toUpperCase()) : null;
      const existing = matchBar || matchFac;

      // Montar string de locação física se corredor ou baia existirem
      const locParts = [item.corredor, item.baia, item.nivel].filter(Boolean);
      const locacao = locParts.length > 0 ? locParts.join('-') : (item.nivel ? `NIVEL-${item.nivel}` : '');

      if (!item.corredor && !item.baia) {
        countSemLocacao++;
      }

      if (existing) {
        // Já existe: atualiza locação se o existente não tiver locação
        if ((!existing.locacao || existing.locacao === '') && locacao) {
          toUpdate.push({
            id: existing.id,
            corredor: item.corredor,
            baia: item.baia,
            nivel: item.nivel,
            locacao,
          });
          countAtualizados++;
        }
      } else {
        countNovos++;
        const id = `PRD-${String(nextId++).padStart(5, '0')}`;
        const desc = item.codigo_fabrica ? `PRODUTO ${item.codigo_fabrica}` : 'PRODUTO EM ESTOQUE';
        toInsert.push({
          id,
          codigo_atual: id,
          codigo_fabrica: item.codigo_fabrica,
          codigo_barras_atual: item.codigo_barras,
          descricao: desc,
          corredor: item.corredor,
          baia: item.baia,
          nivel: item.nivel,
          locacao,
          quantidade: 0,
          estoque_minimo: 0,
          origem: item.origem,
        });
      }
    }

    console.log(`\n[Diagnóstico de Carga]`);
    console.log(`- Itens novos para cadastrar: ${countNovos}`);
    console.log(`- Itens já existentes para atualizar locação: ${countAtualizados}`);
    console.log(`- Itens sem locação completa (apenas nível ou código): ${countSemLocacao}`);

    if (dryRun) {
      console.log(`\nModo SIMULAÇÃO (--dry-run). Nenhuma gravação efetuada.`);
      return;
    }

    // Executar gravação em lotes (Chunks de 500)
    console.log(`\nIniciando gravação real de ${toInsert.length} novos produtos em lotes no Neon...`);
    const chunkSize = 500;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      await client.query('BEGIN');
      for (const p of chunk) {
        await client.query(`
          INSERT INTO produtos (
            id, codigo_atual, codigo_fabrica, codigo_barras_atual,
            descricao, corredor, baia, nivel, locacao,
            quantidade, estoque_minimo, criado_em, atualizado_em
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `, [
          p.id,
          p.codigo_atual,
          p.codigo_fabrica,
          p.codigo_barras_atual,
          p.descricao,
          p.corredor,
          p.baia,
          p.nivel,
          p.locacao,
          p.quantidade,
          p.estoque_minimo,
        ]);

        if (p.codigo_barras_atual) {
          await client.query(`
            INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
            VALUES ($1, 'codigo_barras', $2, true, $3)
            ON CONFLICT DO NOTHING
          `, [p.id, p.codigo_barras_atual, `Carga ${p.origem}`]);
        }
      }
      await client.query('COMMIT');
      console.log(`- Lote ${Math.floor(i / chunkSize) + 1}/${Math.ceil(toInsert.length / chunkSize)} gravado com sucesso (${chunk.length} itens).`);
    }

    if (toUpdate.length > 0) {
      console.log(`Atualizando locação de ${toUpdate.length} produtos existentes...`);
      await client.query('BEGIN');
      for (const u of toUpdate) {
        await client.query(`
          UPDATE produtos 
          SET corredor = $1, baia = $2, nivel = $3, locacao = $4, atualizado_em = NOW()
          WHERE id = $5
        `, [u.corredor, u.baia, u.nivel, u.locacao, u.id]);
      }
      await client.query('COMMIT');
    }

    console.log(`\n✅ Carga concluída com sucesso! Total no banco agora: ${existingRes.rows.length + toInsert.length}`);
  } finally {
    client.release();
  }
}

if (process.argv.includes('--execute')) {
  importNiveis(false).then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  importNiveis(true).then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
