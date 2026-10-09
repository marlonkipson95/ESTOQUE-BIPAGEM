import { Router, Request, Response } from 'express';
import { getDbPool } from '../db.js';

export const auditoriaRouter = Router();

// GET /api/auditoria (Livro de Registro Técnico & Rastreabilidade)
auditoriaRouter.get('/auditoria', async (req: Request, res: Response) => {
  const { search, limit = 100 } = req.query;
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        let query = `
          SELECT h.*, p.codigo_atual, p.descricao
          FROM historico_alteracoes h
          LEFT JOIN produtos p ON p.id = h.produto_id
        `;
        const params: any[] = [];
        if (search && typeof search === 'string' && search.trim()) {
          query += ` WHERE (p.descricao ILIKE $1 OR p.codigo_atual ILIKE $1 OR h.produto_id ILIKE $1 OR h.campo ILIKE $1 OR h.usuario ILIKE $1 OR h.motivo ILIKE $1)`;
          params.push(`%${search.trim()}%`);
        }
        query += ` ORDER BY h.criado_em DESC LIMIT $${params.length + 1}`;
        params.push(Math.min(300, Number(limit) || 100));

        const result = await client.query(query, params);
        return res.json({ success: true, registros: result.rows });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao consultar auditoria:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback memory
  return res.json({ success: true, registros: [] });
});

// POST /api/auditoria/reverter/:id (Desfazer/Reverter alteração indevida)
auditoriaRouter.post('/auditoria/reverter/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { usuario = 'Programador / Admin' } = req.body;

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const histRes = await client.query('SELECT * FROM historico_alteracoes WHERE id = $1', [id]);
      if (histRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Registro de auditoria não encontrado.' });
      }

      const registro = histRes.rows[0];
      const { produto_id, campo, valor_anterior, valor_novo } = registro;

      if (valor_anterior === null || valor_anterior === undefined) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Este registro não possui valor anterior armazenado para reverter.' });
      }

      // Reverter no produto
      if (campo === 'localizacao') {
        try {
          const locObj = JSON.parse(valor_anterior);
          await client.query(`
            UPDATE produtos 
            SET corredor = $1, baia = $2, nivel = $3, locacao = $4, atualizado_em = NOW()
            WHERE id = $5
          `, [locObj.corredor || '', locObj.baia || '', locObj.nivel || '', locObj.locacao || '', produto_id]);
        } catch {
          await client.query(`UPDATE produtos SET locacao = $1, atualizado_em = NOW() WHERE id = $2`, [valor_anterior, produto_id]);
        }
      } else {
        const allowedColumns = [
          'descricao', 'codigo_atual', 'codigo_fabrica', 'codigo_barras_atual',
          'custo_unitario', 'preco_tabela', 'preco_sugerido', 'preco_minimo',
          'quantidade', 'estoque_minimo', 'corredor', 'baia', 'nivel', 'locacao', 'codigos_alternativos'
        ];
        if (allowedColumns.includes(campo)) {
          let val: any = valor_anterior;
          if (['custo_unitario', 'preco_tabela', 'preco_sugerido', 'preco_minimo'].includes(campo)) {
            val = Number(valor_anterior) || 0;
          } else if (['quantidade', 'estoque_minimo'].includes(campo)) {
            val = parseInt(valor_anterior, 10) || 0;
          }
          await client.query(`UPDATE produtos SET ${campo} = $1, atualizado_em = NOW() WHERE id = $2`, [val, produto_id]);
        }
      }

      // Inserir registro de auditoria da própria reversão
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        produto_id,
        campo,
        valor_novo,
        valor_anterior,
        `Reversão da alteração #${id} realizada pelo programador/administrador`,
        usuario
      ]);

      await client.query('COMMIT');
      return res.json({ 
        success: true, 
        message: `Alteração no campo "${campo}" revertida com sucesso! O valor anterior foi restaurado.` 
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao reverter alteração:', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  return res.status(400).json({ error: 'Operação requer banco de dados ativo.' });
});
