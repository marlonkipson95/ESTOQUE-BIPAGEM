import { getDbPool } from '../server/db';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pool = getDbPool();
  try {
    const res = await pool.query(`
      UPDATE usuarios 
      SET cargo = 'Administrador', 
          perm_consultas = true, 
          perm_alterar_basico = true, 
          perm_alterar_preco = true, 
          perm_alterar_locacao = true, 
          perm_alterar_desc = true 
      WHERE username = 'estoque'
      RETURNING *;
    `);
    console.log('Update result:', res.rows[0]);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

main();
