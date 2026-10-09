import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from './db.js';
import { requireAuth } from './middleware/auth.js';

import { authRouter } from './routes/auth.routes.js';
import { produtosRouter } from './routes/produtos.routes.js';
import { orcamentosRouter } from './routes/orcamentos.routes.js';
import { auditoriaRouter } from './routes/auditoria.routes.js';
import { listasRouter } from './routes/listas.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { importarRouter } from './routes/importar.routes.js';
import { chatRouter } from './chat.js';
import { cosmosRouter } from './cosmos.js';
import { visionRouter } from './vision.js';

export const apiRouter = Router();

// Proteção Zero-Trust global
apiRouter.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/login/') {
    return next();
  }
  return requireAuth(req, res, next);
});

// GET /api/health (Status do sistema e conexão com Neon)
apiRouter.get('/health', async (req: Request, res: Response) => {
  const dbStatus = await checkDatabaseConnection();
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus.connected ? 'connected' : 'disconnected',
    database_error: dbStatus.error,
  });
});

// Módulos desacoplados e organizados
apiRouter.use(authRouter);
apiRouter.use(produtosRouter);
apiRouter.use(orcamentosRouter);
apiRouter.use(auditoriaRouter);
apiRouter.use(listasRouter);
apiRouter.use(dashboardRouter);
apiRouter.use(importarRouter);

// Serviços externos e IA
apiRouter.use('/chat', chatRouter);
apiRouter.use('/cosmos', cosmosRouter);
apiRouter.use('/vision', visionRouter);
