import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDbPool } from '../db.js';

export const authRouter = Router();

export interface MemoryUser {
  id: number | string;
  username: string;
  password?: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  criado_em: string;
  ultimo_login?: string;
  perm_consultas?: boolean;
  perm_alterar_basico?: boolean;
  perm_alterar_preco?: boolean;
  perm_alterar_locacao?: boolean;
  perm_alterar_desc?: boolean;
}

export const memoryUsers: MemoryUser[] = [
  {
    id: 1,
    username: 'estoque',
    password: 'controle12',
    nome: 'Operador Almoxarifado',
    cargo: 'Administrador',
    ativo: true,
    criado_em: new Date().toISOString(),
  },
];

// POST /api/auth/login
authRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    console.error('[Auth] JWT_SECRET ausente');
    return res.status(500).json({ error: 'Erro interno de configuração.' });
  }

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM usuarios WHERE LOWER(username) = LOWER($1) AND ativo = true', [cleanUser]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        
        const isValid = await bcrypt.compare(cleanPass, user.password);
        
        if (isValid) {
          await client.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [user.id]);
          
          const token = jwt.sign({ id: user.id, username: user.username }, secret, { expiresIn: '12h' });
          
          delete user.password;
          return res.json({ success: true, token, user });
        }
      }
    } catch (err) {
      console.error('[API] Erro ao autenticar:', err);
    } finally {
      client.release();
    }
  }

  return res.status(401).json({ error: 'Credenciais inválidas. Verifique o usuário e senha informados.' });
});

// GET /api/usuarios (Listar usuários)
authRouter.get('/usuarios', async (req: Request, res: Response) => {
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT id, username, nome, cargo, ativo, criado_em, ultimo_login, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc FROM usuarios ORDER BY id ASC'
        );
        return res.json({ users: result.rows });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao listar usuários no PostgreSQL:', err.message);
    }
  }

  // Fallback memory
  const sanitized = memoryUsers.map(({ password, ...rest }) => rest);
  return res.json({ users: sanitized });
});

// POST /api/usuarios (Cadastrar novo usuário)
authRouter.post('/usuarios', async (req: Request, res: Response) => {
  const { username, password, nome, cargo = 'Operador Almoxarifado', perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc } = req.body;

  if (!username || !password || !nome) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();
  const cleanNome = String(nome).trim();
  const cleanCargo = String(cargo).trim();

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const check = await client.query('SELECT id FROM usuarios WHERE LOWER(username) = LOWER($1)', [cleanUser]);
        if (check.rows.length > 0) {
          return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
        }

        const insert = await client.query(
          `INSERT INTO usuarios (username, password, nome, cargo, ativo, criado_em, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc)
           VALUES ($1, $2, $3, $4, true, NOW(), $5, $6, $7, $8, $9)
           RETURNING id, username, nome, cargo, ativo, criado_em, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc`,
          [cleanUser, cleanPass, cleanNome, cleanCargo, 
           perm_consultas ?? true, perm_alterar_basico ?? true, perm_alterar_preco ?? true, perm_alterar_locacao ?? true, perm_alterar_desc ?? true]
        );

        return res.status(201).json({ user: insert.rows[0] });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao criar usuário no PostgreSQL:', err.message);
      return res.status(500).json({ error: 'Erro ao criar usuário: ' + err.message });
    }
  }

  // Fallback memory
  const exists = memoryUsers.some(u => u.username.toLowerCase() === cleanUser);
  if (exists) {
    return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
  }

  const newUser: MemoryUser = {
    id: Date.now(),
    username: cleanUser,
    password: cleanPass,
    nome: cleanNome,
    cargo: cleanCargo,
    ativo: true,
    criado_em: new Date().toISOString(),
  };
  memoryUsers.push(newUser);

  const { password: _, ...safeUser } = newUser;
  return res.status(201).json({ user: safeUser });
});

// PUT /api/usuarios/:id (Atualizar usuário/senha)
authRouter.put('/usuarios/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { nome, password, cargo, ativo, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc } = req.body;

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const sets: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (nome !== undefined) {
          sets.push(`nome = $${idx++}`);
          values.push(String(nome).trim());
        }
        if (cargo !== undefined) {
          sets.push(`cargo = $${idx++}`);
          values.push(String(cargo).trim());
        }
        if (password !== undefined && String(password).trim()) {
          sets.push(`password = $${idx++}`);
          values.push(String(password).trim());
        }
        if (ativo !== undefined) {
          sets.push(`ativo = $${idx++}`);
          values.push(Boolean(ativo));
        }

        if (perm_consultas !== undefined) {
          sets.push(`perm_consultas = $${idx++}`);
          values.push(Boolean(perm_consultas));
        }
        if (perm_alterar_basico !== undefined) {
          sets.push(`perm_alterar_basico = $${idx++}`);
          values.push(Boolean(perm_alterar_basico));
        }
        if (perm_alterar_preco !== undefined) {
          sets.push(`perm_alterar_preco = $${idx++}`);
          values.push(Boolean(perm_alterar_preco));
        }
        if (perm_alterar_locacao !== undefined) {
          sets.push(`perm_alterar_locacao = $${idx++}`);
          values.push(Boolean(perm_alterar_locacao));
        }
        if (perm_alterar_desc !== undefined) {
          sets.push(`perm_alterar_desc = $${idx++}`);
          values.push(Boolean(perm_alterar_desc));
        }

        if (sets.length === 0) {
          return res.status(400).json({ error: 'Nenhum dado informado para atualização.' });
        }

        values.push(id);
        const query = `
          UPDATE usuarios 
          SET ${sets.join(', ')} 
          WHERE id = $${idx}
          RETURNING id, username, nome, cargo, ativo, criado_em, ultimo_login, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc
        `;

        const result = await client.query(query, values);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        return res.json({ user: result.rows[0] });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao atualizar usuário:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback memory
  const idx = memoryUsers.findIndex(u => String(u.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (nome !== undefined) memoryUsers[idx].nome = String(nome).trim();
  if (cargo !== undefined) memoryUsers[idx].cargo = String(cargo).trim();
  if (password !== undefined && String(password).trim()) memoryUsers[idx].password = String(password).trim();
  if (ativo !== undefined) memoryUsers[idx].ativo = Boolean(ativo);

  const { password: _, ...safeUser } = memoryUsers[idx];
  return res.json({ user: safeUser });
});

// DELETE /api/usuarios/:id (Excluir usuário - não permite excluir 'estoque')
authRouter.delete('/usuarios/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const userRes = await client.query('SELECT username FROM usuarios WHERE id = $1', [id]);
        if (userRes.rows.length === 0) {
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        if (userRes.rows[0].username.toLowerCase() === 'estoque') {
          return res.status(403).json({ error: 'O usuário mestre "estoque" não pode ser excluído.' });
        }

        await client.query('DELETE FROM usuarios WHERE id = $1', [id]);
        return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao excluir usuário:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback memory
  const user = memoryUsers.find(u => String(u.id) === String(id));
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  if (user.username.toLowerCase() === 'estoque') {
    return res.status(403).json({ error: 'O usuário mestre "estoque" não pode ser excluído.' });
  }

  const idx = memoryUsers.findIndex(u => String(u.id) === String(id));
  memoryUsers.splice(idx, 1);
  return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
});
