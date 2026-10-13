require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r1 = await pool.query("SELECT count(id) FROM produtos WHERE codigo_barras_atual IS NULL OR trim(codigo_barras_atual) = ''");
  console.log('Produtos sem codigo_barras_atual:', r1.rows[0].count);
  const r2 = await pool.query("SELECT count(id) FROM produtos WHERE codigo_atual IS NULL OR trim(codigo_atual) = ''");
  console.log('Produtos sem codigo_atual:', r2.rows[0].count);
  const r3 = await pool.query("SELECT count(id) FROM produtos WHERE (codigo_barras_atual IS NULL OR trim(codigo_barras_atual) = '') AND (codigo_atual IS NULL OR trim(codigo_atual) = '')");
  console.log('Produtos sem barras E sem codigo:', r3.rows[0].count);
  await pool.end();
}
main();
