require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'produtos' ORDER BY ordinal_position");
    console.log('COLUNAS PRODUTOS:', cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));

    const colNames = cols.rows.map(c => c.column_name);

    const hasEstFisico = colNames.includes('estoque_fisico');
    const hasUltCompra = colNames.includes('ultima_compra');
    const hasUltDataCompra = colNames.includes('ultima_data_compra');
    const hasNcm = colNames.includes('ncm');

    console.log('Existe estoque_fisico?', hasEstFisico);
    console.log('Existe ultima_compra?', hasUltCompra);
    console.log('Existe ultima_data_compra?', hasUltDataCompra);
    console.log('Existe ncm?', hasNcm);

    const queryStr = `
      SELECT 
        count(*) as total,
        count(*) FILTER (WHERE quantidade IS NOT NULL AND quantidade > 0) as quant_maior_zero,
        count(*) FILTER (WHERE quantidade = 0) as quant_zero,
        count(*) FILTER (WHERE quantidade IS NULL) as quant_null
        ${hasEstFisico ? `, count(*) FILTER (WHERE estoque_fisico IS NOT NULL AND estoque_fisico > 0) as est_fisico_maior_zero,
          count(*) FILTER (WHERE estoque_fisico = 0) as est_fisico_zero,
          count(*) FILTER (WHERE estoque_fisico IS NULL) as est_fisico_null` : ''}
        ${hasNcm ? `, count(*) FILTER (WHERE ncm IS NOT NULL AND trim(ncm) != '') as com_ncm,
          count(*) FILTER (WHERE ncm IS NULL OR trim(ncm) = '') as sem_ncm` : ''}
        ${hasUltCompra ? `, count(*) FILTER (WHERE ultima_compra IS NOT NULL) as com_ult_compra` : ''}
        ${hasUltDataCompra ? `, count(*) FILTER (WHERE ultima_data_compra IS NOT NULL) as com_ult_data_compra` : ''}
      FROM produtos
    `;
    const stats = await pool.query(queryStr);
    console.log('ESTATISTICAS DO BANCO:', stats.rows[0]);

    const sample = await pool.query("SELECT id, codigo_atual, codigo_fabrica, descricao, quantidade, " + 
      (hasEstFisico ? "estoque_fisico, " : "") + 
      (hasNcm ? "ncm, " : "") + 
      (hasUltDataCompra ? "ultima_data_compra, " : "") +
      (hasUltCompra ? "ultima_compra " : "preco_sugerido ") +
      "FROM produtos LIMIT 10");
    console.log('AMOSTRA 10 PRODUTOS:');
    console.table(sample.rows);
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await pool.end();
  }
}
run();
