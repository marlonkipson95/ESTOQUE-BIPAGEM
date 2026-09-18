import { initDatabaseSchema } from '../server/db';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await initDatabaseSchema();
  console.log('Schema initialized');
  process.exit(0);
}
run();
