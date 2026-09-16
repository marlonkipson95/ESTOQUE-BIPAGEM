import { getDbPool } from '../server/db';
import * as dotenv from 'dotenv';
dotenv.config(); // load .env if necessary

async function checkAnomalies() {
  console.log('Buscando produtos...');
  const pool = getDbPool();
  if (!pool) {
    console.error('Pool is null - DATABASE_URL missing');
    return;
  }
  try {
    const { rows: all } = await pool.query('SELECT id, codigo_atual, codigo_fabrica, descricao, preco_tabela FROM produtos');
    
    // Filter in JS
    const anomalousProducts = all.filter(p => {
      const desc = (p.descricao || '').trim();
      if (!desc) return true; // empty description is an anomaly
      
      // If it is just numbers, spaces, dots and commas
      if (/^[\d.,\s-]+$/.test(desc)) return true;
      
      // If it looks like a currency value (e.g. R$ 10,00)
      if (desc.toUpperCase().startsWith('R$')) return true;
      
      return false;
    });

    console.log(`Total de produtos analisados: ${all.length}`);
    console.log(`Total de anomalias encontradas: ${anomalousProducts.length}\n`);
    
    console.log('--- AMOSTRA DE ANOMALIAS (até 50) ---');
    console.table(anomalousProducts.slice(0, 50));
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkAnomalies();
