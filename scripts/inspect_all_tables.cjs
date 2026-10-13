require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('=== TABELAS NO POSTGRESQL ===');
    for (const row of tables.rows) {
      try {
        const countRes = await pool.query(`SELECT count(*) FROM "${row.table_name}"`);
        console.log(`- ${row.table_name}: ${countRes.rows[0].count} registros`);
      } catch (e) {
        console.log(`- ${row.table_name}: erro ao contar (${e.message})`);
      }
    }
  } finally {
    await pool.end();
  }
}

main();
