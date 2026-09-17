import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { getDbPool } from './db.js';

export const chatRouter = Router();

// Estado na memória para orçamentos pendentes de confirmação por sessão
interface PendingBudgetItem {
  produto_id: string;
  codigo: string;
  codigo_fabrica?: string;
  descricao: string;
  locacao?: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  preco_minimo?: number;
}

interface PendingBudget {
  sessionId: string;
  vendedor: string;
  nome_cliente: string;
  itens: PendingBudgetItem[];
  total_orcamento: number;
  criado_em: string;
}

const pendingBudgets = new Map<string, PendingBudget>();

function formatMoney(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d: Date = new Date()): string {
  return d.toLocaleDateString('pt-BR');
}

/**
 * Busca produtos no banco de dados real (PostgreSQL Neon)
 */
async function searchProductDb(term: string): Promise<any[]> {
  const pool = getDbPool();
  if (!pool) return [];

  const clean = term.trim();
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao,
              quantidade, corredor, baia, nivel, locacao,
              preco_sugerido, preco_minimo, preco_tabela, custo_unitario
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1)
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
          OR codigo_atual ILIKE '%' || $1 || '%'
          OR codigo_fabrica ILIKE '%' || $1 || '%'
          OR codigo_barras_atual ILIKE '%' || $1 || '%'
          OR descricao ILIKE '%' || $1 || '%'
       ORDER BY 
          CASE 
            WHEN UPPER(codigo_atual) = UPPER($1) THEN 1
            WHEN UPPER(codigo_fabrica) = UPPER($1) THEN 2
            WHEN UPPER(codigo_barras_atual) = UPPER($1) THEN 3
            ELSE 4
          END
       LIMIT 6`,
      [clean]
    );
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Motor de interpretação de regras operacionais da Otto Diesel
 */
export async function processChatMessage(message: string, sessionId: string): Promise<string> {
  const cleanMsg = message.trim();
  const lower = cleanMsg.toLowerCase();

  // 1. COMANDO "CONFIRMAR" (case-insensitive)
  if (lower === 'confirmar' || lower.startsWith('confirmar ') || lower === 'sim' || lower === 'confirma') {
    const pending = pendingBudgets.get(sessionId);
    if (!pending) {
      return '⚠️ Não há nenhum orçamento pendente de confirmação no momento.\n\nPara preparar um novo orçamento, digite por exemplo:\n`criar orçamento, Marlon, 70200821, 2 unidades`';
    }

    const pool = getDbPool();
    if (!pool) {
      return '❌ Erro: Não foi possível conectar ao banco de dados para salvar o orçamento.';
    }

    const client = await pool.connect();
    try {
      const dbItens = pending.itens.map(item => ({
        id: item.produto_id,
        codigo_atual: item.codigo,
        codigo_fabrica: item.codigo_fabrica,
        descricao: item.descricao,
        locacao: item.locacao,
        quantidade: item.quantidade,
        valor_unitario: item.preco_unitario,
        subtotal: item.subtotal,
      }));

      const res = await client.query(
        `INSERT INTO orcamentos (nome_cliente, responsavel, itens, total_orcamento, criado_em, atualizado_em) 
         VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, criado_em`,
        [pending.nome_cliente, pending.vendedor, JSON.stringify(dbItens), pending.total_orcamento]
      );

      const savedId = res.rows[0]?.id || 'OK';
      pendingBudgets.delete(sessionId);

      return `✅ **Orçamento #${savedId} confirmado e gravado com sucesso!**\n\n` +
             `📅 **Data de geração:** ${formatDate()}\n` +
             `👤 **Vendedor:** ${pending.vendedor}\n` +
             `🏢 **Cliente:** ${pending.nome_cliente}\n` +
             `💰 **Valor Total:** ${formatMoney(pending.total_orcamento)}\n\n` +
             `Este orçamento já está salvo permanentemente no banco de dados e disponível na aba **Orçamentos** para visualização e impressão.`;
    } catch (err: any) {
      console.error('[Chat] Erro ao gravar orçamento:', err);
      return `❌ Erro ao salvar o orçamento no banco de dados: ${err.message}`;
    } finally {
      client.release();
    }
  }

  // 2. CANCELAR ORÇAMENTO PENDENTE
  if (lower === 'cancelar' || lower === 'descartar') {
    if (pendingBudgets.has(sessionId)) {
      pendingBudgets.delete(sessionId);
      return '🗑️ Orçamento pendente cancelado com sucesso.';
    }
    return 'Nenhum orçamento pendente para cancelar.';
  }

  // 3. CRIAÇÃO DE ORÇAMENTO
  const isBudgetIntent = 
    lower.includes('orçamento') || 
    lower.includes('orcamento') || 
    lower.includes('orcar') || 
    lower.includes('orçar') || 
    lower.includes('cotacao') || 
    lower.includes('cotação');

  if (isBudgetIntent) {
    // Extração do vendedor
    // Formatos comuns: "criar orçamento, Marlon, 70200821, 2 unidades"
    // ou "orçamento vendedor Marlon produto 70200821 2 peças"
    const parts = cleanMsg.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    let vendedor = '';
    let candidateCode = '';
    let candidateQtd = 1;
    let explicitPrice: number | null = null;
    let targetTotal: number | null = null;

    // Tentar extrair de texto livre
    // Detectar vendedor: palavra após "vendedor", ou se tiver virgulas, o 2º elemento (se o 1º for "criar orçamento")
    const vendedorMatch = cleanMsg.match(/vendedor[:\s]+([a-zA-ZÀ-ÿ]+)/i);
    if (vendedorMatch) {
      vendedor = vendedorMatch[1];
    } else if (parts.length >= 2) {
      // Ex: [ "crir orçamento", "marlon", "70200821", "2 unidades" ]
      const p1Lower = parts[0].toLowerCase();
      if (p1Lower.includes('orçamento') || p1Lower.includes('orcamento') || p1Lower.includes('crir') || p1Lower.includes('criar')) {
        // Se a segunda parte não for só números
        if (!/^\d+$/.test(parts[1])) {
          vendedor = parts[1].replace(/vendedor\s*/i, '').trim();
        }
      }
    }

    // Se ainda não achou vendedor
    if (!vendedor) {
      // Verificar se algum nome comum foi digitado logo após criar orçamento
      const words = cleanMsg.split(/\s+/);
      const idx = words.findIndex(w => w.toLowerCase().includes('orça') || w.toLowerCase().includes('orca'));
      if (idx !== -1 && words[idx + 1] && !/^\d+$/.test(words[idx + 1])) {
        vendedor = words[idx + 1].replace(/[,;]/g, '');
      }
    }

    if (!vendedor) {
      return '⚠️ **Identificação de Vendedor Obrigatória:**\n\nPor favor, informe o nome do vendedor responsável no comando.\nExemplo:\n`criar orçamento, Marlon, 70200821, 2 unidades`';
    }

    // Extração de quantidade (ex: "2 unidades", "2 un", "2 peças", "2 pcs", "qtd 2")
    const qtdMatch = cleanMsg.match(/(\d+)\s*(unidades?|un|peças?|pecas?|itens|pçs?)/i);
    if (qtdMatch) {
      candidateQtd = parseInt(qtdMatch[1], 10) || 1;
    }

    // Extração de preço explícito (ex: "a 250 reais", "por 50,00", "unitario 80")
    const priceMatch = cleanMsg.match(/(?:a|por|preço|preco|unitario|unitário)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (priceMatch) {
      const parsedVal = parseFloat(priceMatch[1].replace(',', '.'));
      if (!isNaN(parsedVal)) explicitPrice = parsedVal;
    }

    // Extração de total desejado (ex: "total de 5000", "valor total 5 mil")
    const totalMatch = cleanMsg.match(/valor\s*total\s*(?:de\s*)?(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (totalMatch) {
      const parsedTot = parseFloat(totalMatch[1].replace(',', '.'));
      if (!isNaN(parsedTot)) targetTotal = parsedTot;
    }

    // Extração de código do produto
    // Se tiver partes separadas por vírgula, encontrar a parte que não é comando, vendedor nem quantidade
    if (parts.length >= 3) {
      for (const part of parts) {
        const pLow = part.toLowerCase().trim();
        if (pLow.includes('orça') || pLow.includes('orca') || pLow.includes('crir') || pLow.includes('criar') || pLow.includes('cotac') || pLow.includes('cotaç')) continue;
        if (vendedor && pLow === vendedor.toLowerCase()) continue;
        if (/^\d+\s*(unidades?|un|peças?|pecas?|itens|pçs?)?$/i.test(pLow)) continue;
        if (pLow.startsWith('valor') || pLow.startsWith('total') || pLow.startsWith('preço') || pLow.startsWith('preco')) continue;
        
        // Esta parte é o código ou nome da peça!
        candidateCode = part.trim();
        break;
      }
    }

    // Se ainda não encontrou nas partes:
    if (!candidateCode) {
      // Buscar sequência de dígitos de 4 a 14 dígitos que não seja a quantidade
      const digitsMatch = cleanMsg.match(/\b(\d{4,14})\b/g);
      if (digitsMatch) {
        for (const d of digitsMatch) {
          if (d !== String(candidateQtd)) {
            candidateCode = d;
            break;
          }
        }
      }
    }

    if (!candidateCode) {
      // Fallback genérico para códigos alfanuméricos como 0445120007, etc.
      for (const part of parts) {
        const cleanPart = part.replace(/(unidades?|un|peças?|pecas?|criar|crir|orçamento|orcamento|vendedor)/gi, '').trim();
        const codeCandidate = cleanPart.match(/\b([A-Za-z0-9\.-]{4,20})\b/);
        if (codeCandidate && codeCandidate[1] !== String(candidateQtd) && codeCandidate[1].toLowerCase() !== vendedor.toLowerCase()) {
          candidateCode = codeCandidate[1];
          break;
        }
      }
    }

    if (!candidateCode) {
      return `⚠️ Não consegui identificar o código do produto na mensagem.\n\nPor favor, envie no formato:\n\`criar orçamento, ${vendedor}, [CÓDIGO], [QUANTIDADE] un\``;
    }

    // Consultar o produto no banco real
    const productsFound = await searchProductDb(candidateCode);
    if (productsFound.length === 0) {
      return `❌ **INFORMAÇÃO NÃO ENCONTRADA**\n\nNenhum produto cadastrado no banco de dados com o código ou termo **"${candidateCode}"**.\n\nPor regra de negócio, nenhum orçamento pode ser criado com peças inexistentes.`;
    }

    const prod = productsFound[0];

    // Regras de Preço (BUSINESS_RULES.md):
    // Preço sugerido do banco -> se não houver, preco_minimo -> se não houver, R$ 150,00 padrão
    const precoMinimoDb = prod.preco_minimo ? parseFloat(prod.preco_minimo) : 0;
    const precoSugeridoDb = prod.preco_sugerido ? parseFloat(prod.preco_sugerido) : null;
    const precoTabelaDb = prod.preco_tabela ? parseFloat(prod.preco_tabela) : null;

    let unitPrice = precoSugeridoDb || precoTabelaDb || (precoMinimoDb > 0 ? precoMinimoDb : 150.0);

    if (explicitPrice !== null) {
      if (precoMinimoDb > 0 && explicitPrice < precoMinimoDb) {
        return `❌ **Regra de Preço Mínimo Violada:**\n\nO valor unitário informado (${formatMoney(explicitPrice)}) é menor que o Preço Mínimo permitido pelo banco para este item (${formatMoney(precoMinimoDb)}).\n\nO orçamento não pode ser gerado abaixo do preço mínimo.`;
      }
      unitPrice = explicitPrice;
    }

    if (targetTotal !== null && candidateQtd > 0) {
      const calculatedUnit = targetTotal / candidateQtd;
      if (precoMinimoDb > 0 && calculatedUnit < precoMinimoDb) {
        return `❌ **Regra de Preço Mínimo:**\n\nO valor total de ${formatMoney(targetTotal)} para ${candidateQtd} unidade(s) resulta em ${formatMoney(calculatedUnit)} por unidade, o que é abaixo do Preço Mínimo cadastrado (${formatMoney(precoMinimoDb)}).\n\nAjuste a quantidade ou o valor total.`;
      }
      unitPrice = calculatedUnit;
    }

    const subtotal = candidateQtd * unitPrice;
    const locacaoStr = prod.locacao || [prod.corredor, prod.baia, prod.nivel].filter(Boolean).join('-') || 'Sem locação';

    const item: PendingBudgetItem = {
      produto_id: prod.id,
      codigo: prod.codigo_atual || prod.codigo_fabrica,
      codigo_fabrica: prod.codigo_fabrica,
      descricao: prod.descricao,
      locacao: locacaoStr,
      quantidade: candidateQtd,
      preco_unitario: unitPrice,
      subtotal: subtotal,
      preco_minimo: precoMinimoDb,
    };

    const pendingBudget: PendingBudget = {
      sessionId,
      vendedor: vendedor.charAt(0).toUpperCase() + vendedor.slice(1).toLowerCase(),
      nome_cliente: 'Cliente Balcão',
      itens: [item],
      total_orcamento: subtotal,
      criado_em: new Date().toISOString(),
    };

    // Armazena na sessão
    pendingBudgets.set(sessionId, pendingBudget);

    return `📋 **Estrutura do Orçamento Preparada**\n\n` +
           `📅 **Data de geração:** ${formatDate()}\n` +
           `👤 **Vendedor:** ${pendingBudget.vendedor}\n` +
           `🏢 **Cliente:** ${pendingBudget.nome_cliente}\n\n` +
           `| Código | Descrição | Locação | Qtd | Preço Unit. | Subtotal |\n` +
           `| :--- | :--- | :---: | :---: | :---: | :---: |\n` +
           `| **${item.codigo}** | ${item.descricao} | \`${item.locacao}\` | ${item.quantidade} un | ${formatMoney(item.preco_unitario)} | **${formatMoney(item.subtotal)}** |\n\n` +
           `💰 **VALOR TOTAL GERAL:** **${formatMoney(subtotal)}**\n` +
           `📦 **Estoque Físico Atual:** ${prod.quantidade} unidades disponíveis\n\n` +
           `---\n` +
           `⚠️ **Aguardando Validação do Vendedor:**\n` +
           `Você pode conferir os valores acima. Para efetivar e gravar este orçamento no sistema, digite **CONFIRMAR**.\n` +
           `*(Se quiser cancelar, basta digitar CANCELAR).*`;
  }

  // 4. CONSULTA DE LOCALIZAÇÃO OU ESTOQUE
  const isSearchIntent = 
    lower.includes('onde') || 
    lower.includes('localiz') || 
    lower.includes('locação') || 
    lower.includes('locacao') || 
    lower.includes('estoque') || 
    lower.includes('peça') || 
    lower.includes('peca') || 
    lower.includes('tem ');

  if (isSearchIntent) {
    const codeMatch = cleanMsg.match(/\b([A-Za-z0-9\.-]{4,20})\b/);
    const searchTerm = codeMatch ? codeMatch[1] : cleanMsg.replace(/(onde|está|esta|a|peça|peca|tem|qual|localizacao|locacao|no|estoque)/gi, '').trim();

    if (!searchTerm) {
      return 'Por favor, informe o código da peça ou o nome para consulta no estoque.';
    }

    const prods = await searchProductDb(searchTerm);
    if (prods.length === 0) {
      return `❌ **INFORMAÇÃO NÃO ENCONTRADA:**\nNenhum produto cadastrado com o código ou nome **"${searchTerm}"**.`;
    }

    const p = prods[0];
    const locStr = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join('-') || 'Sem localização cadastrada';
    const precoSug = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : 'Não informado';
    const precoMin = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : 'Não informado';

    return `🔍 **Dados do Produto Localizado no Banco:**\n\n` +
           `* **Código Interno:** \`${p.codigo_atual}\`\n` +
           `* **Código de Fábrica:** \`${p.codigo_fabrica || '—'}\`\n` +
           `* **Descrição:** ${p.descricao}\n` +
           `* **📍 Locação Física:** **Corredor ${p.corredor || '—'}, Baia ${p.baia || '—'}, Nível ${p.nivel || '—'}** (\`${locStr}\`)\n` +
           `* **📦 Estoque Físico:** **${p.quantidade}** unidades\n` +
           `* **💵 Preço Sugerido:** ${precoSug} | **Preço Mínimo:** ${precoMin}\n\n` +
           `Se desejar gerar uma prévia de orçamento para este item, basta solicitar:\n` +
           `\`criar orçamento, [Vendedor], ${p.codigo_atual}, [Qtd] unidades\``;
  }

  // 5. LISTAR ÚLTIMOS ORÇAMENTOS
  if (lower.includes('listar') || lower.includes('ultimos') || lower.includes('últimos') || lower.includes('quantos orçamentos')) {
    const pool = getDbPool();
    if (!pool) return 'Banco de dados desconectado.';
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT * FROM orcamentos ORDER BY criado_em DESC LIMIT 5');
      if (res.rows.length === 0) {
        return 'Nenhum orçamento gravado no banco de dados até o momento.';
      }
      let reply = `📋 **Últimos ${res.rows.length} Orçamentos Salvos:**\n\n`;
      for (const r of res.rows) {
        reply += `* **ID #${r.id}** (${new Date(r.criado_em).toLocaleDateString('pt-BR')}): Vendedor **${r.responsavel}** | Total: **${formatMoney(parseFloat(r.total_orcamento))}**\n`;
      }
      return reply;
    } finally {
      client.release();
    }
  }

  // 6. TENTATIVA COM GEMINI AI (SE DISPONÍVEL) OU AJUDA PADRÃO
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({});
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: cleanMsg,
        config: {
          systemInstruction: 'Você é o Assistente Inteligente da Otto Diesel. Não invente dados de produtos ou preços. Se não souber, oriente o usuário a usar os comandos de orçamento ou busca.',
        }
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err) {
      console.warn('[Chat] Gemini API não disponível, usando resposta local');
    }
  }

  // Resposta padrão caso não reconheça
  return `Olá! Sou o **Assistente Inteligente de Estoque e Orçamentos da Otto Diesel**.\n\n` +
         `Como posso te ajudar agora?\n\n` +
         `* **Criar Orçamento:** \`criar orçamento, Marlon, 70200821, 2 unidades\`\n` +
         `* **Localizar Peça:** \`onde está a peça 70200821?\`\n` +
         `* **Consultar Estoque:** \`estoque do código 78467\`\n` +
         `* **Listar Orçamentos:** \`listar últimos orçamentos\`\n` +
         `* **Confirmar Gravação:** \`confirmar\``;
}

chatRouter.post('/', async (req: Request, res: Response) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Mensagem é obrigatória' });
  }

  const aiEnabled = process.env.AI_CHAT_ENABLED !== 'false';
  if (!aiEnabled) {
    return res.json({ response: 'O Assistente Inteligente está temporariamente desativado via configuração.' });
  }

  try {
    const responseText = await processChatMessage(message, sessionId);
    return res.json({ response: responseText });
  } catch (error: any) {
    console.error('[Chat] Erro no processamento:', error);
    return res.status(500).json({ 
      response: `Ocorreu um erro ao processar sua solicitação: ${error.message}` 
    });
  }
});
