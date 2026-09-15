import 'dotenv/config';
import { initDatabaseSchema } from './server/db.js';

async function run() {
  console.log('Iniciando esquema do banco...');
  await initDatabaseSchema();
  console.log('Finalizado.');
  process.exit(0);
}

run();
