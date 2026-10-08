import { config } from 'dotenv';
config();
import { initDatabaseSchema, getDbPool } from '../server/db';
async function test() {
  await initDatabaseSchema();
  const pool = getDbPool();
  if(!pool) throw new Error("No pool");
  
  const term = '940703290052';
  const res = await pool.query(
      `SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1)
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
          OR codigo_atual ILIKE '%' || $1 || '%'
          OR codigo_fabrica ILIKE '%' || $1 || '%'
          OR codigo_barras_atual ILIKE '%' || $1 || '%'
          OR descricao ILIKE '%' || $1 || '%'`,
      [term]
  );
  
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}
test().catch(console.error);
