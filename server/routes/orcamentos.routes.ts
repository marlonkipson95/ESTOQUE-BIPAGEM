import { Router, Request, Response } from 'express';
import { getDbPool } from '../db.js';

export const orcamentosRouter = Router();

let memoryOrcamentos: any[] = []; // Contingência em memória

// GET /api/orcamentos (Listar todos os orçamentos, ordenados por data)
orcamentosRouter.get('/orcamentos', async (req: Request, res: Response) => {
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM orcamentos ORDER BY criado_em DESC');
        return res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao buscar orcamentos:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.json(memoryOrcamentos);
});

// POST /api/orcamentos (Criar ou atualizar orçamento)
orcamentosRouter.post('/orcamentos', async (req: Request, res: Response) => {
  const { id, nome_cliente, responsavel, itens, total_orcamento } = req.body;
  
  if (!nome_cliente || !responsavel || !itens) {
    return res.status(400).json({ error: 'Dados incompletos para orçamento.' });
  }

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        if (id) {
          // Atualizar
          const result = await client.query(
            `UPDATE orcamentos 
             SET nome_cliente = $1, responsavel = $2, itens = $3, total_orcamento = $4, atualizado_em = NOW() 
             WHERE id = $5 RETURNING *`,
            [nome_cliente, responsavel, JSON.stringify(itens), total_orcamento, id]
          );
          return res.json({ success: true, orcamento: result.rows[0] });
        } else {
          // Inserir novo
          const result = await client.query(
            `INSERT INTO orcamentos (nome_cliente, responsavel, itens, total_orcamento) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [nome_cliente, responsavel, JSON.stringify(itens), total_orcamento]
          );
          return res.status(201).json({ success: true, orcamento: result.rows[0] });
        }
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao salvar orçamento:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback memory
  if (id) {
    const idx = memoryOrcamentos.findIndex(o => o.id === id);
    if (idx >= 0) {
      memoryOrcamentos[idx] = { ...memoryOrcamentos[idx], nome_cliente, responsavel, itens, total_orcamento, atualizado_em: new Date().toISOString() };
      return res.json({ success: true, orcamento: memoryOrcamentos[idx] });
    }
  }
  
  const novoOrcamento = {
    id: id || `temp-${Date.now()}`,
    nome_cliente,
    responsavel,
    itens,
    total_orcamento,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };
  memoryOrcamentos.push(novoOrcamento);
  return res.status(201).json({ success: true, orcamento: novoOrcamento });
});

// DELETE /api/orcamentos/:id (Excluir orçamento)
orcamentosRouter.delete('/orcamentos/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query('DELETE FROM orcamentos WHERE id = $1', [id]);
        return res.json({ success: true });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao excluir orçamento:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback memory
  memoryOrcamentos = memoryOrcamentos.filter(o => o.id !== id);
  return res.json({ success: true });
});
