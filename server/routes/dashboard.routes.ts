import { Router, Request, Response } from 'express';
import { getDbPool } from '../db.js';

export const dashboardRouter = Router();

// GET /api/dashboard/stats
dashboardRouter.get('/dashboard/stats', async (req: Request, res: Response) => {
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const totalRes = await client.query('SELECT COUNT(*) as count FROM produtos');
        const comEstoqueRes = await client.query('SELECT COUNT(*) as count FROM produtos WHERE quantidade > 0');
        const semEstoqueRes = await client.query('SELECT COUNT(*) as count FROM produtos WHERE quantidade = 0');
        const semLocacaoRes = await client.query("SELECT COUNT(*) as count FROM produtos WHERE (corredor = '' OR corredor IS NULL) AND (locacao = '' OR locacao IS NULL)");
        const semBarcodeRes = await client.query("SELECT COUNT(*) as count FROM produtos WHERE (codigo_barras_atual = '' OR codigo_barras_atual IS NULL)");
        const codigosAltRes = await client.query('SELECT COUNT(*) as count FROM codigos_produto WHERE desativado_em IS NOT NULL');
        const lotesRes = await client.query('SELECT * FROM lotes_importacao ORDER BY criado_em DESC LIMIT 5');

        return res.json({
          total_produtos: parseInt(totalRes.rows[0].count, 10),
          com_estoque: parseInt(comEstoqueRes.rows[0].count, 10),
          sem_estoque: parseInt(semEstoqueRes.rows[0].count, 10),
          sem_localizacao: parseInt(semLocacaoRes.rows[0].count, 10),
          sem_codigo_barras: parseInt(semBarcodeRes.rows[0].count, 10),
          codigos_alterados_recentes: parseInt(codigosAltRes.rows[0].count, 10),
          ultimas_importacoes: lotesRes.rows,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao obter stats do PostgreSQL:', err.message);
    }
  }

  // Fallback memory
  return res.json({
    total_produtos: 0,
    com_estoque: 0,
    sem_estoque: 0,
    sem_localizacao: 0,
    sem_codigo_barras: 0,
    codigos_alterados_recentes: 0,
    ultimas_importacoes: [],
  });
});
