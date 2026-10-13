require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const kipHash = bcrypt.hashSync('kipson2024', 10);
    await pool.query(`
      INSERT INTO usuarios (username, password, nome, cargo, ativo)
      VALUES ('kipson', $1, 'Marlon Kipson', 'Administrador', true)
      ON CONFLICT (username) DO NOTHING;
    `, [kipHash]);

    const venHash = bcrypt.hashSync('senha-vendedor', 10);
    await pool.query(`
      INSERT INTO usuarios (username, password, nome, cargo, ativo)
      VALUES ('vendedor', $1, 'Vendedor Balcão', 'Vendedor', true)
      ON CONFLICT (username) DO NOTHING;
    `, [venHash]);

    const res = await pool.query('SELECT username, cargo, ativo FROM usuarios');
    console.log('USUARIOS AGORA:', res.rows);
  } finally {
    await pool.end();
  }
}

seed();
