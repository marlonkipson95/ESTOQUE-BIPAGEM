import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDbPool } from '../db.js';

// Extender o objeto Request para incluir o user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso negado. Token ausente ou formato inválido.' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('[Auth] Erro Crítico: JWT_SECRET não está configurado.');
    return res.status(500).json({ error: 'Erro interno de configuração do servidor.' });
  }

  try {
    const decoded = jwt.verify(token, secret) as { id: number; username: string };
    
    // Identificar usuário e permissões reais no banco (Zero-Trust)
    const pool = getDbPool();
    if (!pool) throw new Error('Database not connected');
    
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM usuarios WHERE id = $1 AND ativo = true', [decoded.id]);
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
      }

      req.user = result.rows[0];
      // Remover a senha do objeto antes de passar adiante por segurança
      delete req.user.password;
      
      next();
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido ou corrompido.' });
  }
};

// Exemplo de middleware para rotas que precisam de permissão específica
export const requirePermission = (permissionField: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user[permissionField]) {
      return res.status(403).json({ error: 'Você não tem permissão para realizar esta operação.' });
    }
    next();
  };
};
