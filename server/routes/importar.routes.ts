import { Router, Request, Response } from 'express';
import { getDbPool } from '../db.js';

export const importarRouter = Router();

// POST /api/importar/comparar (Classificação Inteligente: Novo, Sem Alteração, Com Alteração)
importarRouter.post('/importar/comparar', async (req: Request, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nenhum item enviado para comparação.' });
  }

  const pool = getDbPool();
  const comparisonItems: any[] = [];
  let novosCount = 0;
  let semAlteracaoCount = 0;
  let comAlteracaoCount = 0;

  if (pool) {
    const client = await pool.connect();
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const desc = item.descricao?.trim() || '';
        if (!desc) continue;

        const codAtual = item.codigo_atual?.trim() || '';
        const barcode = item.codigo_barras_atual?.trim() || '';
        const codFabrica = item.codigo_fabrica?.trim() || '';

        // Prioridade mandatória de reconhecimento: 1. Código interno -> 2. EAN -> 3. Código do Fabricante
        let existingProd: any = null;
        let matchedBy: string | undefined;

        if (codAtual) {
          const resC = await client.query('SELECT * FROM produtos WHERE UPPER(codigo_atual) = UPPER($1) LIMIT 1', [codAtual]);
          if (resC.rows.length > 0) {
            existingProd = resC.rows[0];
            matchedBy = 'codigo_interno';
          }
        }

        if (!existingProd && barcode) {
          const resB = await client.query('SELECT * FROM produtos WHERE UPPER(codigo_barras_atual) = UPPER($1) LIMIT 1', [barcode]);
          if (resB.rows.length > 0) {
            existingProd = resB.rows[0];
            matchedBy = 'codigo_barras';
          }
        }

        if (!existingProd && codFabrica) {
          const resF = await client.query('SELECT * FROM produtos WHERE UPPER(codigo_fabrica) = UPPER($1) LIMIT 1', [codFabrica]);
          if (resF.rows.length > 0) {
            existingProd = resF.rows[0];
            matchedBy = 'codigo_fabrica';
          }
        }

        if (existingProd) {
          const changes: { field: string; label: string; currentValue: string; newValue: string }[] = [];

          const newLoc = item.locacao?.trim() || (item.corredor || item.baia || item.nivel ? `${item.corredor}-${item.baia}-${item.nivel}`.replace(/^-|-$/g, '') : '');
          const currLoc = existingProd.locacao || (existingProd.corredor || existingProd.baia || existingProd.nivel ? `${existingProd.corredor}-${existingProd.baia}-${existingProd.nivel}`.replace(/^-|-$/g, '') : '');
          if (newLoc && newLoc !== currLoc) {
            changes.push({ field: 'locacao', label: 'Localização', currentValue: currLoc || 'Sem localização', newValue: newLoc });
          }

          if (barcode && barcode !== existingProd.codigo_barras_atual) {
            changes.push({ field: 'codigo_barras', label: 'Código de Barras (EAN)', currentValue: existingProd.codigo_barras_atual || 'Não cadastrado', newValue: barcode });
          }

          if (codFabrica && codFabrica !== existingProd.codigo_fabrica) {
            changes.push({ field: 'codigo_fabrica', label: 'Código Fabricante', currentValue: existingProd.codigo_fabrica || 'Não cadastrado', newValue: codFabrica });
          }

          if (desc && desc.toUpperCase() !== existingProd.descricao?.toUpperCase()) {
            changes.push({ field: 'descricao', label: 'Descrição', currentValue: existingProd.descricao, newValue: desc });
          }

          const newQtd = parseInt(item.quantidade, 10);
          if (!isNaN(newQtd) && newQtd > 0 && newQtd !== existingProd.quantidade) {
            changes.push({ field: 'quantidade', label: 'Estoque', currentValue: String(existingProd.quantidade), newValue: String(newQtd) });
          }

          const newCusto = Number(item.custo_unitario);
          if (!isNaN(newCusto) && newCusto > 0 && Math.abs(newCusto - Number(existingProd.custo_unitario)) > 0.001) {
            changes.push({ field: 'custo_unitario', label: 'Custo Unitário', currentValue: `R$ ${Number(existingProd.custo_unitario).toFixed(2)}`, newValue: `R$ ${newCusto.toFixed(2)}` });
          }

          if (changes.length > 0) {
            comAlteracaoCount++;
            comparisonItems.push({
              id: `comp-${i}`,
              status: 'com_alteracao',
              matchedBy,
              existingProduct: existingProd,
              importData: item,
              changes,
              selected: true,
            });
          } else {
            semAlteracaoCount++;
            comparisonItems.push({
              id: `comp-${i}`,
              status: 'sem_alteracao',
              matchedBy,
              existingProduct: existingProd,
              importData: item,
              changes: [],
              selected: false,
            });
          }
        } else {
          novosCount++;
          comparisonItems.push({
            id: `comp-${i}`,
            status: 'novo',
            importData: item,
            changes: [],
            selected: true,
          });
        }
      }

      return res.json({
        items: comparisonItems,
        summary: {
          total: comparisonItems.length,
          novos: novosCount,
          semAlteracao: semAlteracaoCount,
          comAlteracao: comAlteracaoCount,
        },
      });
    } finally {
      client.release();
    }
  }

  return res.json({
    items: [],
    summary: { total: 0, novos: 0, semAlteracao: 0, comAlteracao: 0 },
  });
});

// POST /api/importar (Carga de Dados em Lote com Regras de Proteção)
importarRouter.post('/importar', async (req: Request, res: Response) => {
  const {
    items,
    fileName = 'arquivo_importado.csv',
    preserveExistingLocation = true,
    archiveOldBarcodesInHistory = true,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Lista de itens para importação está vazia.' });
  }

  let novos = 0;
  let atualizados = 0;
  let erros = 0;

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of items) {
        if (!item.descricao || !item.descricao.trim()) {
          erros++;
          continue;
        }

        const barcode = item.codigo_barras_atual?.trim() || '';
        const codFabrica = item.codigo_fabrica?.trim() || '';
        const codAtual = item.codigo_atual?.trim() || '';

        // Procurar se produto existe respeitando a prioridade mandatória:
        // 1. Código Interno -> 2. Código de Barras (EAN) -> 3. Código do Fabricante
        let existingId: string | null = null;

        if (codAtual) {
          const findC = await client.query('SELECT id FROM produtos WHERE UPPER(codigo_atual) = UPPER($1) LIMIT 1', [codAtual]);
          if (findC.rows.length > 0) existingId = findC.rows[0].id;
        }

        if (!existingId && barcode) {
          const findB = await client.query('SELECT id FROM produtos WHERE UPPER(codigo_barras_atual) = UPPER($1) LIMIT 1', [barcode]);
          if (findB.rows.length > 0) existingId = findB.rows[0].id;
        }

        if (!existingId && codFabrica) {
          const findF = await client.query('SELECT id FROM produtos WHERE UPPER(codigo_fabrica) = UPPER($1) LIMIT 1', [codFabrica]);
          if (findF.rows.length > 0) existingId = findF.rows[0].id;
        }

        if (existingId) {
          // PRODUTO EXISTENTE: Atualizar sem perder localização física existente (Regra mandante)
          const curr = await client.query('SELECT * FROM produtos WHERE id = $1', [existingId]);
          const currProd = curr.rows[0];

          const finalCorredor = preserveExistingLocation ? (currProd.corredor || item.corredor || '') : (item.corredor || currProd.corredor || '');
          const finalBaia = preserveExistingLocation ? (currProd.baia || item.baia || '') : (item.baia || currProd.baia || '');
          const finalNivel = preserveExistingLocation ? (currProd.nivel || item.nivel || '') : (item.nivel || currProd.nivel || '');
          const finalLoc = preserveExistingLocation ? (currProd.locacao || item.locacao || '') : (item.locacao || currProd.locacao || '');

          // Se código de barras mudou e opção de arquivar está ligada
          if (barcode && barcode !== currProd.codigo_barras_atual && archiveOldBarcodesInHistory) {
            await client.query(`
              UPDATE codigos_produto 
              SET ativo = false, desativado_em = NOW(), motivo = $1
              WHERE produto_id = $2 AND tipo = 'codigo_barras' AND ativo = true
            `, [`Importação da planilha ${fileName}`, existingId]);

            await client.query(`
              INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
              VALUES ($1, 'codigo_barras', $2, true, $3)
            `, [existingId, barcode, `Importado de ${fileName}`]);
          }

          await client.query(`
            UPDATE produtos SET
              descricao = $1,
              codigo_fabrica = COALESCE(NULLIF($2, ''), codigo_fabrica),
              codigo_barras_atual = COALESCE(NULLIF($3, ''), codigo_barras_atual),
              quantidade = CASE WHEN $4 > 0 THEN $4 ELSE quantidade END,
              custo_unitario = CASE WHEN $5 > 0 THEN $5 ELSE custo_unitario END,
              corredor = $6,
              baia = $7,
              nivel = $8,
              locacao = $9,
              ultima_data_venda = COALESCE(NULLIF($10, ''), ultima_data_venda),
              ultima_data_compra = COALESCE(NULLIF($11, ''), ultima_data_compra),
              atualizado_em = NOW()
            WHERE id = $12
          `, [
            item.descricao.trim(),
            codFabrica,
            barcode,
            parseInt(item.quantidade, 10) || 0,
            Number(item.custo_unitario) || 0,
            finalCorredor,
            finalBaia,
            finalNivel,
            finalLoc,
            item.ultima_data_venda?.trim() || '',
            item.ultima_data_compra?.trim() || '',
            existingId,
          ]);

          atualizados++;
        } else {
          // NOVO PRODUTO
          const countRes = await client.query('SELECT COUNT(*) as count FROM produtos');
          const nextNum = parseInt(countRes.rows[0].count, 10) + 1;
          const newId = `PRD-${String(nextNum).padStart(4, '0')}`;
          const finalCode = codAtual || newId;
          const finalLoc = item.locacao || (item.corredor || item.baia || item.nivel ? `${item.corredor}-${item.baia}-${item.nivel}`.replace(/^-|-$/g, '') : '');

          await client.query(`
            INSERT INTO produtos (
              id, codigo_atual, codigo_fabrica, codigo_barras_atual,
              descricao, custo_unitario, quantidade, estoque_minimo,
              corredor, baia, nivel, locacao, ultima_data_venda, ultima_data_compra, criado_em, atualizado_em
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
          `, [
            newId,
            finalCode,
            codFabrica,
            barcode,
            item.descricao.trim(),
            Number(item.custo_unitario) || 0,
            parseInt(item.quantidade, 10) || 0,
            parseInt(item.estoque_minimo, 10) || 0,
            item.corredor || '',
            item.baia || '',
            item.nivel || '',
            finalLoc,
            item.ultima_data_venda?.trim() || '',
            item.ultima_data_compra?.trim() || '',
          ]);

          if (barcode) {
            await client.query(`
              INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
              VALUES ($1, 'codigo_barras', $2, true, 'Importação inicial')
            `, [newId, barcode]);
          }

          if (finalCode) {
            await client.query(`
              INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
              VALUES ($1, 'codigo_produto', $2, true, 'Importação inicial')
            `, [newId, finalCode]);
          }

          novos++;
        }
      }

      // Processar vínculos de códigos genéricos informados na planilha
      for (const item of items) {
        const rawGen = String(item.genericos || item.codigos_genericos || '').trim();
        if (!rawGen) continue;

        const codFabrica = item.codigo_fabrica?.trim() || '';
        const codAtual = item.codigo_atual?.trim() || '';
        const barcode = item.codigo_barras_atual?.trim() || '';

        const mainRes = await client.query(`
          SELECT id FROM produtos
          WHERE (UPPER(codigo_fabrica) = UPPER($1) AND $1 <> '')
             OR (UPPER(codigo_atual) = UPPER($2) AND $2 <> '')
             OR (UPPER(codigo_barras_atual) = UPPER($3) AND $3 <> '')
          LIMIT 1
        `, [codFabrica, codAtual, barcode]);

        if (mainRes.rows.length === 0) continue;
        const mainId = mainRes.rows[0].id;

        const genList = rawGen.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean);
        for (const gCode of genList) {
          const peerRes = await client.query(`
            SELECT id FROM produtos
            WHERE UPPER(codigo_fabrica) = UPPER($1)
               OR UPPER(codigo_atual) = UPPER($1)
               OR UPPER(codigo_barras_atual) = UPPER($1)
            LIMIT 1
          `, [gCode]);

          if (peerRes.rows.length > 0) {
            const peerId = peerRes.rows[0].id;
            if (peerId !== mainId) {
              await client.query(`
                INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
                VALUES ($1, $2, 'Importado via Planilha')
                ON CONFLICT (produto_id, relacionado_id) DO NOTHING
              `, [mainId, peerId]);

              await client.query(`
                INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
                VALUES ($1, $2, 'Importado via Planilha')
                ON CONFLICT (produto_id, relacionado_id) DO NOTHING
              `, [peerId, mainId]);
            }
          }
        }
      }

      // Registrar lote
      await client.query(`
        INSERT INTO lotes_importacao (arquivo, total, novos, atualizados, erros, usuario)
        VALUES ($1, $2, $3, $4, $5, 'Operador Almoxarifado')
      `, [fileName, items.length, novos, atualizados, erros]);

      await client.query('COMMIT');
      return res.json({
        total: items.length,
        novos,
        atualizados,
        erros,
        message: 'Lote importado com sucesso no PostgreSQL Neon.',
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro no lote de importação:', err.message);
      return res.status(500).json({ error: 'Falha na transação de importação: ' + err.message });
    } finally {
      client.release();
    }
  }

  return res.json({ total: items.length, novos: 0, atualizados: 0, erros: items.length });
});
