import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { getDbPool } from './db.js';

export const chatRouter = Router();

// Estado global para lidar com confirmações de orçamentos por sessão/usuário.
// Em um sistema real maior, isso ficaria no Redis ou DB. 
const pendingBudgets = new Map<string, any>();

chatRouter.post('/', async (req: Request, res: Response) => {
  const { message, sessionId } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Mensagem é obrigatória' });
  }

  // Cost Protection Logic
  const aiEnabled = process.env.AI_CHAT_ENABLED !== 'false';
  if (!aiEnabled) {
    return res.json({ response: "O Assistente Inteligente está temporariamente desativado." });
  }

  // TODO: Add daily limit check if needed based on AI_MAX_MESSAGES_DAY.

  try {
    // If user says "confirmar", check if there is a pending budget
    if (message.trim().toLowerCase() === 'confirmar') {
      const pending = pendingBudgets.get(sessionId);
      if (pending) {
        // Execute the insertion
        const pool = getDbPool();
        if (pool) {
          const client = await pool.connect();
          try {
            const result = await client.query(
              `INSERT INTO orcamentos (nome_cliente, responsavel, itens, total_orcamento, criado_em, atualizado_em) 
               VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
              [pending.nome_cliente || 'Cliente Padrão', pending.responsavel, JSON.stringify(pending.itens), pending.total_orcamento]
            );
            pendingBudgets.delete(sessionId);
            return res.json({ 
              response: `✅ Orçamento confirmado e gravado com sucesso!\n\n**Data de geração:** ${new Date().toLocaleDateString('pt-BR')}\n**ID:** ${result.rows[0].id}`
            });
          } finally {
            client.release();
          }
        } else {
          return res.json({ response: "Não foi possível conectar ao banco de dados para confirmar o orçamento." });
        }
      } else {
        return res.json({ response: "Não há nenhum orçamento pendente de confirmação." });
      }
    }

    // Initialize Gemini SDK
    // The key should be in process.env.GEMINI_API_KEY
    const ai = new GoogleGenAI({});

    // Read business rules (simulated in prompt here)
    const systemInstruction = `
Você é o Assistente Inteligente de Estoque e Orçamentos da Otto Diesel.
REGRA FUNDAMENTAL: ZERO ALUCINAÇÃO. Use as ferramentas disponíveis para consultar dados reais.
O banco de dados é a fonte de verdade. Nunca invente dados.
Se não encontrar a informação, diga "INFORMAÇÃO NÃO ENCONTRADA".
Para orçamentos, o vendedor deve ser informado. Se a ferramenta de preparar orçamento retornar dados, exiba-os e peça para o usuário digitar "CONFIRMAR".
    `;

    // Define tools
    const tools = [
      {
        name: 'buscar_produto',
        description: 'Busca um produto no banco de dados por código, nome ou código de barras.',
        parameters: {
          type: 'object',
          properties: { termo: { type: 'string' } },
          required: ['termo']
        }
      },
      {
        name: 'preparar_orcamento',
        description: 'Prepara um orçamento. Usa valores fixos fornecidos ou busca o preço mínimo/sugerido (ou 150 padrão). Faz o rateio do valor_total se fornecido.',
        parameters: {
          type: 'object',
          properties: { 
            vendedor: { type: 'string' },
            itens: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  produto_id: { type: 'string' },
                  quantidade: { type: 'number' },
                  preco_unitario_informado: { type: 'number' }
                }
              }
            },
            valor_total_desejado: { type: 'number' }
          },
          required: ['vendedor', 'itens']
        }
      }
    ];

    // TODO: Connect Gemini response logic with tools.
    // For now, return a placeholder to ensure the route connects properly.
    return res.json({ response: "Funcionalidade de processamento de linguagem natural em desenvolvimento. Conectado ao backend com sucesso!" });

  } catch (error: any) {
    if (error.status === 429) {
      return res.json({ response: "Limite gratuito diário atingido. O assistente voltará a responder amanhã sem custos adicionais." });
    }
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
