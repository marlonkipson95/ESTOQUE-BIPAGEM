import { GoogleGenAI, Type, Content } from '@google/genai';
import { 
  toolConsultarProdutoPorCodigo, 
  executeConsultarProdutoPorCodigo,
  toolConsultarProdutosPorTermo,
  executeConsultarProdutosPorTermo,
  toolConsultarProdutosPorCorredor,
  executeConsultarProdutosPorCorredor,
  toolConsultarRankingEstoque,
  executeConsultarRankingEstoque,
  toolAdicionarAoCarrinho,
  executeAdicionarAoCarrinho,
  toolVerCarrinho,
  executeVerCarrinho
} from './gemini_tools.js';

// Inicialização segura
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const toolDeclaration = {
  functionDeclarations: [
    toolConsultarProdutoPorCodigo, 
    toolConsultarProdutosPorTermo, 
    toolConsultarProdutosPorCorredor,
    toolConsultarRankingEstoque,
    toolAdicionarAoCarrinho, 
    toolVerCarrinho
  ]
};

const CANDIDATE_MODELS = ['gemini-3.5-flash', 'gemini-3.8-flash'];

async function generateWithModelFallback(params: any) {
  if (!ai) throw new Error('GEMINI_API_KEY não configurada no servidor.');
  
  let lastError: any = null;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      return await ai.models.generateContent({
        ...params,
        model: modelName,
      });
    } catch (err: any) {
      lastError = err;
      // Se for 503 (sobrecarga temporária) ou 404, tenta o próximo modelo
      console.warn(`[Gemini] Modelo ${modelName} falhou (${err.message}). Tentando alternativa...`);
    }
  }
  throw lastError;
}

export async function processarMensagemGemini(mensagem: string, userId?: string) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY não configurada no servidor.');
  }

  const systemInstruction = 
    "Você é o Assistente Inteligente de Estoque e Orçamentos do KIPSTOCK (Otto Diesel).\n" +
    "Seu objetivo é auxiliar operadores e vendedores a consultar dados oficiais do estoque e montar orçamentos.\n" +
    "REGRA ABSOLUTA: ZERO ALUCINAÇÃO. O banco de dados PostgreSQL é a única fonte de verdade. NUNCA invente preços, códigos, quantidades, estoques, NCMs ou datas.\n" +
    "Sempre que consultar produtos, informe com clareza os campos disponíveis:\n" +
    "- Código (Interno e de Fábrica)\n" +
    "- Descrição\n" +
    "- Estoque Contábil e Estoque Físico\n" +
    "- NCM (se informado no banco)\n" +
    "- Data de Última Compra (se informada no banco)\n" +
    "- Localização Física (Corredor, Baia, Nível)\n" +
    "- Preço Sugerido, Mínimo e Tabela\n" +
    "Se o estoque estiver em 0, informe claramente que o estoque cadastrado é zero. Se uma informação não constar no banco, diga que não está cadastrada.\n" +
    "Para listas de produtos, utilize sempre tabelas Markdown bem alinhadas.";

  // 1. Enviar mensagem para o Gemini interpretar a intenção
  const response = await generateWithModelFallback({
    contents: mensagem,
    config: {
      tools: [toolDeclaration],
      systemInstruction,
      temperature: 0.1,
    }
  });

  // 2. Verificar se o modelo decidiu chamar ferramentas
  if (response.functionCalls && response.functionCalls.length > 0) {
    const call = response.functionCalls[0];
    let dbResult: any = null;
    
    // Execução da Ferramenta correspondente
    if (call.name === 'consultar_produto_por_codigo') {
      const codigo = (call.args as any).codigo;
      dbResult = await executeConsultarProdutoPorCodigo(codigo);
    } else if (call.name === 'consultar_produtos_por_termo') {
      const termo = (call.args as any).termo;
      dbResult = await executeConsultarProdutosPorTermo(termo);
    } else if (call.name === 'consultar_produtos_por_corredor') {
      const args = call.args as any;
      dbResult = await executeConsultarProdutosPorCorredor(
        args.corredor,
        args.preco_maximo,
        args.apenas_com_estoque,
        args.limite
      );
    } else if (call.name === 'consultar_ranking_estoque') {
      const args = call.args as any;
      dbResult = await executeConsultarRankingEstoque(
        args.tipo_estoque,
        args.ordem,
        args.corredor,
        args.limite
      );
    } else if (call.name === 'adicionar_ao_carrinho') {
      if (!userId) {
        dbResult = { status: 'erro', mensagem: 'Usuário não autenticado. Impossível modificar o carrinho.' };
      } else {
        const codigo = (call.args as any).codigo;
        const quantidade = (call.args as any).quantidade;
        const preco_unitario = (call.args as any).preco_unitario || null;
        dbResult = await executeAdicionarAoCarrinho(codigo, quantidade, preco_unitario, parseInt(userId, 10));
      }
    } else if (call.name === 'ver_carrinho') {
      if (!userId) {
        dbResult = { status: 'erro', mensagem: 'Usuário não autenticado. Impossível visualizar o carrinho.' };
      } else {
        dbResult = await executeVerCarrinho(parseInt(userId, 10));
      }
    }

    if (dbResult) {
      // 3. Devolver os dados REAIS para o LLM formatar a resposta final
      try {
        const history: Content[] = [
          { role: 'user', parts: [{ text: mensagem }] },
          response.candidates![0].content,
          { role: 'user', parts: [{ functionResponse: { name: call.name, response: { result: dbResult } } }] }
        ];

        const finalResponse = await generateWithModelFallback({
          contents: history,
          config: {
            systemInstruction: 
              "Formate os dados oficiais retornados pela ferramenta em uma resposta amigável, clara e profissional.\n" +
              "Se for um produto único, destaque: Código de Fábrica, Código Interno, Descrição, Estoque Contábil, Estoque Físico, Diferença, NCM, Última Compra, Localização e Preços.\n" +
              "Se for uma lista de produtos, use tabelas Markdown estruturadas.\n" +
              "NUNCA altere os valores numéricos ou nomes que vieram da ferramenta.",
            temperature: 0.1,
          }
        });
        
        return finalResponse.text;
      } catch (err: any) {
        console.error('[Gemini] Erro no fluxo secundário (formatação):', err.message);
        // Fallback estruturado seguro caso o LLM falhe na segunda chamada
        if (dbResult.status === 'sucesso') {
          return `Consulta realizada com sucesso:\n\`\`\`json\n${JSON.stringify(dbResult, null, 2)}\n\`\`\``;
        } else {
          return dbResult.mensagem;
        }
      }
    }
  }

  return response.text;
}
