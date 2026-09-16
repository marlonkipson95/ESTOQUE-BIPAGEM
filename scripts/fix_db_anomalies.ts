import { getDbPool } from '../server/db';
import * as dotenv from 'dotenv';
dotenv.config();

async function fixAnomalies() {
  console.log('Corrigindo produtos com descrição anômala...');
  const pool = getDbPool();
  if (!pool) {
    console.error('Pool is null');
    return;
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Fetch them all to know what we are updating
    const { rows: all } = await client.query('SELECT id, codigo_atual, codigo_fabrica, descricao FROM produtos');
    
    const anomalousProducts = all.filter(p => {
      const desc = (p.descricao || '').trim();
      if (!desc) return true;
      if (/^[\d.,\s-]+$/.test(desc)) return true;
      if (desc.toUpperCase().startsWith('R$')) return true;
      return false;
    });

    console.log(`Encontrados ${anomalousProducts.length} produtos para corrigir.`);
    
    let updatedCount = 0;
    for (const p of anomalousProducts) {
      const newDesc = p.codigo_fabrica || p.codigo_atual || 'SEM_CODIGO';
      await client.query(
        'UPDATE produtos SET descricao = $1 WHERE id = $2',
        [newDesc, p.id]
      );
      updatedCount++;
    }
    
    await client.query('COMMIT');
    console.log(`Sucesso: ${updatedCount} produtos foram atualizados para usar o código como descrição.`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro durante atualização:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

fixAnomalies();
