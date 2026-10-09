import { GoogleGenAI } from '@google/genai';
import { Router, Request, Response } from 'express';
import { getDbPool } from './db';

export const visionRouter = Router();

// Fallback em memória caso o banco de dados esteja offline
let fallbackDailyUsage = {
  date: new Date().toISOString().split('T')[0],
  count: 0
};

const MAX_FREE_TIER_DAILY_REQUESTS = 1000;

async function checkAndIncrementQuota(): Promise<{ allowed: boolean; currentCount: number }> {
  const pool = getDbPool();
  const today = new Date().toISOString().split('T')[0];

  if (pool) {
    try {
      const res = await pool.query(
        `INSERT INTO api_quotas (service, data_referencia, requisicoes, atualizado_em)
         VALUES ('gemini_vision', $1::date, 1, NOW())
         ON CONFLICT (service, data_referencia)
         DO UPDATE SET requisicoes = api_quotas.requisicoes + 1, atualizado_em = NOW()
         RETURNING requisicoes;`,
        [today]
      );
      const count = parseInt(res.rows[0]?.requisicoes, 10) || 1;
      return { allowed: count <= MAX_FREE_TIER_DAILY_REQUESTS, currentCount: count };
    } catch (err: any) {
      console.warn('[Vision API] Falha ao registrar cota no PostgreSQL, usando fallback em memória:', err.message);
    }
  }

  // Fallback em memória se banco estiver inacessível
  if (fallbackDailyUsage.date !== today) {
    fallbackDailyUsage.date = today;
    fallbackDailyUsage.count = 0;
  }
  fallbackDailyUsage.count++;
  return { 
    allowed: fallbackDailyUsage.count <= MAX_FREE_TIER_DAILY_REQUESTS, 
    currentCount: fallbackDailyUsage.count 
  };
}

visionRouter.post('/identify', async (req: Request, res: Response): Promise<any> => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Nenhuma imagem fornecida.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'A chave da API do Gemini (GEMINI_API_KEY) não está configurada no .env. Configure-a para usar a identificação por foto.' 
    });
  }

  // Quota check persistente
  const { allowed, currentCount } = await checkAndIncrementQuota();
  if (!allowed) {
    return res.status(429).json({ 
      error: `Cota diária de identificação por foto (${MAX_FREE_TIER_DAILY_REQUESTS} requisições) atingida para evitar cobranças. Tente novamente amanhã. (Uso atual: ${currentCount})` 
    });
  }

  try {
    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|webp);base64,/, '');

    const promptText = `Você é um especialista em peças automotivas. Analise a imagem da embalagem ou da própria peça.
Extraia as seguintes informações e retorne APENAS um JSON válido (sem marcação Markdown), com os campos abaixo (se não encontrar algo, deixe como nulo ou string vazia):
- "codigo_fabrica": O part number ou código do fabricante principal.
- "codigo_barras": O código de barras EAN/GTIN, se legível.
- "fabricante": O nome da marca ou fabricante da peça.
- "descricao_sugerida": Uma breve descrição do que parece ser a peça (ex: PISTÃO, ANEL, BOMBA D'ÁGUA).`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const textOutput = response.text;

    if (!textOutput) {
      throw new Error('Formato de resposta inesperado da API.');
    }

    let parsedResult = {};
    try {
      parsedResult = JSON.parse(textOutput.trim());
    } catch {
      throw new Error('A API não retornou um JSON válido.');
    }

    return res.json({
      success: true,
      data: parsedResult,
      message: 'Peça identificada com sucesso pela foto.'
    });

  } catch (error: any) {
    console.error('[Vision API] Falha na identificação por foto:', error.message);
    return res.status(500).json({ error: 'Falha ao analisar a imagem: ' + error.message });
  }
});
