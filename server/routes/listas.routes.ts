import { Router, Request, Response } from 'express';
import { getDbPool } from '../db.js';

export const listasRouter = Router();

let memoryListasRapidas: any[] = [];

// GET /api/listas-rapidas (Listar todas as listas rápidas)
listasRouter.get('/listas-rapidas', async (req: Request, res: Response) => {
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM listas_rapidas ORDER BY criado_em DESC');
        return res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao buscar listas rápidas:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  return res.json(memoryListasRapidas);
});

// GET /api/listas-rapidas/lookup-item/:code (Lookup interno leve SEM gastar cota Cosmos)
listasRouter.get('/listas-rapidas/lookup-item/:code', async (req: Request, res: Response) => {
  const { code } = req.params;
  const clean = (code || '').trim();
  if (!clean) {
    return res.json({ found: false });
  }

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const resProd = await client.query(`
          SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao,
                 corredor, baia, nivel, locacao, quantidade
          FROM produtos
          WHERE UPPER(codigo_atual) = UPPER($1)
             OR UPPER(codigo_fabrica) = UPPER($1)
             OR UPPER(codigo_barras_atual) = UPPER($1)
          LIMIT 1
        `, [clean]);

        if (resProd.rows.length > 0) {
          const p = resProd.rows[0];
          const locStr = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join('-') || '';
          return res.json({
            found: true,
            codigo: p.codigo_atual,
            descricao: p.descricao,
            locacao: locStr,
            quantidade: p.quantidade || 0
          });
        }
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro no lookup rápido de item:', err.message);
    }
  }

  return res.json({ found: false, locacao: '' });
});

// GET /api/listas-rapidas/:id (Buscar lista específica)
listasRouter.get('/listas-rapidas/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM listas_rapidas WHERE id = $1', [id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Lista não encontrada' });
        }
        return res.json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  const item = memoryListasRapidas.find(l => String(l.id) === String(id));
  if (!item) return res.status(404).json({ error: 'Lista não encontrada' });
  return res.json(item);
});

// POST /api/listas-rapidas (Criar ou atualizar lista rápida)
listasRouter.post('/listas-rapidas', async (req: Request, res: Response) => {
  const { id, nome, responsavel = 'Estoque', itens = [] } = req.body;
  if (!nome || typeof nome !== 'string') {
    return res.status(400).json({ error: 'Nome da lista é obrigatório' });
  }

  const totalItens = Array.isArray(itens) ? itens.length : 0;
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        if (id) {
          const result = await client.query(
            `UPDATE listas_rapidas 
             SET nome = $1, responsavel = $2, itens = $3, total_itens = $4, atualizado_em = NOW() 
             WHERE id = $5 RETURNING *`,
            [nome, responsavel, JSON.stringify(itens), totalItens, id]
          );
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lista não encontrada para atualização' });
          }
          return res.json({ success: true, lista: result.rows[0] });
        } else {
          const result = await client.query(
            `INSERT INTO listas_rapidas (nome, responsavel, itens, total_itens) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [nome, responsavel, JSON.stringify(itens), totalItens]
          );
          return res.status(201).json({ success: true, lista: result.rows[0] });
        }
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao salvar lista rápida:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Contingência em memória
  if (id) {
    const idx = memoryListasRapidas.findIndex(l => String(l.id) === String(id));
    if (idx !== -1) {
      memoryListasRapidas[idx] = {
        ...memoryListasRapidas[idx],
        nome,
        responsavel,
        itens,
        total_itens: totalItens,
        atualizado_em: new Date().toISOString()
      };
      return res.json({ success: true, lista: memoryListasRapidas[idx] });
    }
  }

  const novaLista = {
    id: Date.now(),
    nome,
    responsavel,
    itens,
    total_itens: totalItens,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };
  memoryListasRapidas.push(novaLista);
  return res.status(201).json({ success: true, lista: novaLista });
});

// DELETE /api/listas-rapidas/:id (Excluir lista rápida)
listasRouter.delete('/listas-rapidas/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query('DELETE FROM listas_rapidas WHERE id = $1', [id]);
        return res.json({ success: true });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao excluir lista rápida:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  memoryListasRapidas = memoryListasRapidas.filter(l => String(l.id) !== String(id));
  return res.json({ success: true });
});
