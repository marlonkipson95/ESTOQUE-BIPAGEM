import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    const res = await pool.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS perm_consultas BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS perm_alterar_basico BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS perm_alterar_preco BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS perm_alterar_locacao BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS perm_alterar_desc BOOLEAN DEFAULT true;
    `);
    console.log('Columns added/verified.');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

main();
