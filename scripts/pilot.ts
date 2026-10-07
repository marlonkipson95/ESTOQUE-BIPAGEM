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
  
  // Group changes by idInterno
  const changesById: Record<string, any[]> = {};
  for (const c of changes) {
    if (!changesById[c.idInterno]) changesById[c.idInterno] = [];
    changesById[c.idInterno].push(c);
  }

  // Get up to 5 products to pilot
  const pilotIds = Object.keys(changesById).slice(0, 5);
  console.log(`Iniciando Teste Piloto para os seguintes ${pilotIds.length} produtos:`);
  console.log(pilotIds.join(', '));

  if (pilotIds.length === 0) {
    console.log('Nenhum produto para atualizar.');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('Conectado ao banco de dados para o Teste Piloto.');

  try {
    for (const id of pilotIds) {
      await client.query('BEGIN');
      console.log(`\n-> Atualizando Produto: ${id}`);
      
      const prodChanges = changesById[id];
      const updates: Record<string, any> = {};
      
      for (const c of prodChanges) {
        updates[c.campo] = c.depois;
        console.log(`   - [${c.campo}]: de "${c.antes}" para "${c.depois}" (Motivo: ${c.motivo})`);
      }

      // If EAN is updated (codigo_barras_atual), we need to update codigos_produto history too
      if (updates['codigo_barras_atual']) {
        await client.query(`
          UPDATE codigos_produto 
          SET ativo = false, desativado_em = NOW(), motivo = 'Substituído durante importação piloto'
          WHERE produto_id = $1 AND tipo = 'codigo_barras' AND ativo = true
        `, [id]);

        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_barras', $2, true, 'Atualizado durante importação piloto')
        `, [id, updates['codigo_barras_atual']]);
      }

      // Build Dynamic UPDATE query
      const fields = Object.keys(updates).filter(k => k !== 'codigo_barras_atual'); // barcode has its own field but we can update it in produtos table too, it is safe because we do both.
      
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      for (const field of Object.keys(updates)) {
        setClauses.push(`${field} = $${paramIdx}`);
        values.push(updates[field]);
        paramIdx++;
      }
      setClauses.push(`atualizado_em = NOW()`);
      
      if (setClauses.length > 1) { // 1 is atualizado_em
        const query = `UPDATE produtos SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`;
        values.push(id);
        
        await client.query(query, values);
      }

      // Insert into historico_alteracoes
      for (const c of prodChanges) {
        await client.query(`
          INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo)
          VALUES ($1, $2, $3, $4, $5)
        `, [id, c.campo, String(c.antes), String(c.depois), `Importação Piloto - ${c.motivo}`]);
      }

      await client.query('COMMIT');
      console.log(`   [SUCESSO] ${id} atualizado.`);
    }

  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('Erro no piloto:', e.message);
  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
