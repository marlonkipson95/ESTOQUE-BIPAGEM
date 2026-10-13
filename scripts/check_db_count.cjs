require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  console.log('DATABASE_URL presente?', !!connectionString);
  if (!connectionString) return;

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    const res = await pool.query('SELECT count(*) FROM produtos');
    console.log('RES_PRODUTOS_COUNT:', res.rows[0].count);
    const users = await pool.query('SELECT username, nome, ativo FROM usuarios');
    console.log('RES_USUARIOS:', users.rows);
  } catch (err) {
    console.error('Erro query:', err.message);
  } finally {
    await pool.end();
  }
}

main();
