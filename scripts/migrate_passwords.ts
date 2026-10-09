import 'dotenv/config';
import { getDbPool } from '../server/db.js';
import bcrypt from 'bcryptjs';

async function runMigration() {
  console.log('[Migração] Iniciando migração segura de senhas...');
  
  const pool = getDbPool();
  if (!pool) {
    console.error('[Migração] Erro: Conexão com banco não configurada (DATABASE_URL).');
    process.exit(1);
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const result = await client.query('SELECT id, username, password FROM usuarios');
    const usuarios = result.rows;

    let migradas = 0;
    let jaCriptografadas = 0;

    for (const user of usuarios) {
      const currentPassword = String(user.password || '');
      
      // Senhas do bcrypt sempre começam com $2a$, $2b$ ou $2y$ e tem 60 caracteres.
      if (currentPassword.startsWith('$2a$') || currentPassword.startsWith('$2b$') || currentPassword.startsWith('$2y$')) {
        jaCriptografadas++;
        continue;
      }

      console.log(`[Migração] Migrando senha do usuário ID ${user.id} (${user.username})...`);
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(currentPassword, salt);
      
      await client.query('UPDATE usuarios SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
      migradas++;
    }

    await client.query('COMMIT');
    console.log(`[Migração] Concluído! Migradas: ${migradas} | Já criptografadas: ${jaCriptografadas}`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migração] Falha na migração! Operações canceladas de forma segura.', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
    process.exit(0);
  }
}

runMigration();
