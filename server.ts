import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes.js';
import { initDatabaseSchema } from './server/db.js';

const getDirname = () => {
  if (typeof __dirname !== 'undefined') return __dirname;
  try {
    if (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string') {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // Fallback to process.cwd()
  }
  return process.cwd();
};
const __dirnameSafe = getDirname();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Middlewares para parsing de JSON
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Inicializar Schema no Neon PostgreSQL
  try {
    await initDatabaseSchema();
  } catch (err: any) {
    console.error('[Server] Aviso ao conectar/inicializar banco:', err.message);
  }

  // Montar rotas da API REST
  app.use('/api', apiRouter);

  // Vite Middleware em Desenvolvimento vs Static em Produção
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware integrado em modo de desenvolvimento.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Server] Servindo arquivos estáticos em produção.');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`  KIPSTOCK - Backend Server Ativo         `);
    console.log(`  Porta: http://0.0.0.0:${PORT}           `);
    console.log(`  API:   http://0.0.0.0:${PORT}/api/health`);
    console.log(`===========================================`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Falha fatal ao iniciar servidor:', err);
  process.exit(1);
});
