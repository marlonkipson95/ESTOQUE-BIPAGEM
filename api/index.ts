import express from 'express';
import { apiRouter } from '../server/routes.js';
import { initDatabaseSchema } from '../server/db.js';

const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Lazy initialize schema on serverless cold start
let schemaInitialized = false;
app.use(async (req, res, next) => {
  if (!schemaInitialized) {
    try {
      await initDatabaseSchema();
      schemaInitialized = true;
    } catch (err: any) {
      console.warn('[Vercel Serverless] DB init warning:', err.message);
    }
  }
  next();
});

app.use('/api', apiRouter);

export default app;
