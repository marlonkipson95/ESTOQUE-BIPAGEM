import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';
dotenv.config();

const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const r = await p.query(`
    SELECT id, descricao, ncm, quantidade, estoque_fisico, ultima_data_venda, ultima_data_compra 
    FROM produtos 
    WHERE atualizado_em > NOW() - INTERVAL '1 hour' 
    ORDER BY atualizado_em DESC 
    LIMIT 5
  `);
  console.table(r.rows);
  process.exit(0);
}
run();
