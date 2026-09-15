import express from 'express';
import { apiRouter } from '../server/routes.js';

const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Handle both /api/... and direct /... rewrites on Vercel
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
