import 'dotenv/config';
import fs from 'fs';
import { getDbPool } from './server/db.js';

interface CsvRow {
  codigo_fabrica: string;
  baia: string;
  corredor: string;
  nivel: string;
  codigo_barras_atual: string;
  locacao: string;
}

export async function importCorredorL(dryRun = true) {
  const content = fs.readFileSync('itens/CORREDOR_L.csv', 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  
  const items: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';').map(p => p.trim());
    const codOrig = parts[0];
    const baia = parts[1];
    const corredor = parts[2];
    const nivel = parts[3];
    const cleanBar = (parts[4] || '').replace(/\s+/g, '');
    const loc = [corredor, baia, nivel].filter(Boolean).join('-');
    items.push({
      codigo_fabrica: codOrig,
      baia,
      corredor,
      nivel,
      codigo_barras_atual: cleanBar,
      locacao: loc,
    });
  }

  console.log(`[Importador] Lido arquivo: ${items.length} itens encontrados.`);

  const pool = getDbPool();
  if (!pool) {
    throw new Error('DATABASE_URL não configurada');
  }

  const client = await pool.connect();
  try {
    // 1. Verificar itens já existentes no banco
    let novos = 0;
    let existentes = 0;
    const batchInserts: any[] = [];

    // Obter todos os produtos existentes para cruzamento rápido em memória
    const existingRes = await client.query('SELECT id, codigo_atual, codigo_barras_atual, codigo_fabrica FROM produtos');
    const existingMapByBarcode = new Map<string, any>();
    const existingMapByFactory = new Map<string, any>();

    for (const r of existingRes.rows) {
      if (r.codigo_barras_atual) existingMapByBarcode.set(r.codigo_barras_atual.toUpperCase(), r);
      if (r.codigo_fabrica) existingMapByFactory.set(r.codigo_fabrica.toUpperCase(), r);
    }

    let nextIdNum = existingRes.rows.length + 1;

    for (const item of items) {
      const matchBar = item.codigo_barras_atual ? existingMapByBarcode.get(item.codigo_barras_atual.toUpperCase()) : null;
      const matchFac = item.codigo_fabrica ? existingMapByFactory.get(item.codigo_fabrica.toUpperCase()) : null;
      const match = matchBar || matchFac;

      if (match) {
        existentes++;
      } else {
        novos++;
        const id = `PRD-${String(nextIdNum++).padStart(4, '0')}`;
        const desc = `PRODUTO ${item.codigo_fabrica}`;
        batchInserts.push({
          id,
          codigo_atual: item.codigo_fabrica,
          codigo_fabrica: item.codigo_fabrica,
          codigo_barras_atual: item.codigo_barras_atual,
          descricao: desc,
          corredor: item.corredor,
          baia: item.baia,
          nivel: item.nivel,
          locacao: item.locacao,
          quantidade: 0,
          estoque_minimo: 0,
        });
      }
    }

    console.log(`[Relatório Validação]`);
    console.log(`- Total no arquivo: ${items.length}`);
    console.log(`- Novos a cadastrar: ${novos}`);
    console.log(`- Já existentes no banco: ${existentes}`);

    if (!dryRun && batchInserts.length > 0) {
      await client.query('BEGIN');
      for (const p of batchInserts) {
        await client.query(`
          INSERT INTO produtos (
            id, codigo_atual, codigo_fabrica, codigo_barras_atual, 
            descricao, corredor, baia, nivel, locacao, quantidade, estoque_minimo,
            criado_em, atualizado_em
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
          p.estoque_minimo
        ]);

        // Registrar código de barras em codigos_produto
        if (p.codigo_barras_atual) {
          await client.query(`
            INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
            VALUES ($1, 'codigo_barras', $2, true, 'Importação inicial Corredor L')
            ON CONFLICT DO NOTHING
          `, [p.id, p.codigo_barras_atual]);
        }
      }
      await client.query('COMMIT');
      console.log(`[Sucesso] ${batchInserts.length} produtos inseridos com sucesso no Neon!`);
    }

    return { total: items.length, novos, existentes };
  } finally {
    client.release();
  }
}

if (process.argv.includes('--execute')) {
  importCorredorL(false).then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  importCorredorL(true).then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
