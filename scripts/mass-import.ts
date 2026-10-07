import * as fs from 'fs';
import * as path from 'path';
import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';

dotenv.config();

const reportFile = path.resolve('RELATORIO_PRE_IMPORTACAO.json');

async function run() {
  if (!fs.existsSync(reportFile)) {
    console.error('RELATORIO_PRE_IMPORTACAO.json não encontrado. Rode migration.ts primeiro.');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf-8'));
  const changes = report.changes || [];
  
  const changesById: Record<string, any[]> = {};
  for (const c of changes) {
    if (!changesById[c.idInterno]) changesById[c.idInterno] = [];
    changesById[c.idInterno].push(c);
  }

  const allIds = Object.keys(changesById);
  console.log(`Iniciando Importação Massiva para ${allIds.length} produtos.`);

  if (allIds.length === 0) {
    console.log('Nenhum produto para atualizar.');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('Conectado ao banco de dados para a Importação Massiva.');

  let successCount = 0;
  let errorCount = 0;

  try {
    for (let i = 0; i < allIds.length; i++) {
      const id = allIds[i];
      
      try {
        await client.query('BEGIN');
        
        const prodChanges = changesById[id];
        const updates: Record<string, any> = {};
        
        for (const c of prodChanges) {
          updates[c.campo] = c.depois;
        }

        // If EAN is updated (codigo_barras_atual), update codigos_produto history too
        if (updates['codigo_barras_atual']) {
          await client.query(`
            UPDATE codigos_produto 
            SET ativo = false, desativado_em = NOW(), motivo = 'Substituído durante importação em lote'
            WHERE produto_id = $1 AND tipo = 'codigo_barras' AND ativo = true
          `, [id]);

          await client.query(`
            INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
            VALUES ($1, 'codigo_barras', $2, true, 'Atualizado durante importação em lote')
          `, [id, updates['codigo_barras_atual']]);
        }

        const fields = Object.keys(updates).filter(k => k !== 'codigo_barras_atual');
        
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIdx = 1;

        for (const field of Object.keys(updates)) {
          setClauses.push(`${field} = $${paramIdx}`);
          values.push(updates[field]);
          paramIdx++;
        }
        setClauses.push(`atualizado_em = NOW()`);
        
        if (setClauses.length > 1) { 
          const query = `UPDATE produtos SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`;
          values.push(id);
          await client.query(query, values);
        }

        for (const c of prodChanges) {
          await client.query(`
            INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo)
            VALUES ($1, $2, $3, $4, $5)
          `, [id, c.campo, String(c.antes), String(c.depois), `Importação em Lote - ${c.motivo}`]);
        }

        await client.query('COMMIT');
        successCount++;

        // Status report periodically
        if (successCount % 1000 === 0) {
          console.log(`[Progresso]: ${successCount} produtos atualizados com sucesso...`);
        }

      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`Erro ao atualizar produto ${id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\nImportação Massiva Concluída!`);
    console.log(`Sucessos: ${successCount}`);
    console.log(`Erros: ${errorCount}`);

  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
