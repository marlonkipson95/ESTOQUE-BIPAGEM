import { Router, Request, Response } from 'express';

export const visionRouter = Router();

// Store daily usage in memory (resets on server restart, but prevents abuse during uptime)
let dailyUsage = {
  date: new Date().toISOString().split('T')[0],
  count: 0
};

const MAX_FREE_TIER_DAILY_REQUESTS = 1000;

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

  // Quota check
  const today = new Date().toISOString().split('T')[0];
  if (dailyUsage.date !== today) {
    dailyUsage.date = today;
    dailyUsage.count = 0;
  }

  if (dailyUsage.count >= MAX_FREE_TIER_DAILY_REQUESTS) {
    return res.status(429).json({ 
      error: 'Cota diária de identificação por foto (1000 requisições) atingida para evitar cobranças. Tente novamente amanhã.' 
    });
  }

  dailyUsage.count++;

  try {
    // Remove data:image/jpeg;base64, prefix if present
    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|webp);base64,/, '');

    const promptText = `
Você é um especialista em peças automotivas. Analise a imagem da embalagem ou da própria peça.
Extraia as seguintes informações e retorne APENAS um JSON válido (sem marcação Markdown), com os campos abaixo (se não encontrar algo, deixe como nulo ou string vazia):
- "codigo_fabrica": O part number ou código do fabricante principal.
- "codigo_barras": O código de barras EAN/GTIN, se legível.
- "fabricante": O nome da marca ou fabricante da peça.
- "descricao_sugerida": Uma breve descrição do que parece ser a peça (ex: PISTÃO, ANEL, BOMBA D'ÁGUA).
`;

    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000) // 15 seconds max
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API do Gemini: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data: any = await response.json();
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
