import { GoogleGenAI, Type, Content } from '@google/genai';
import { 
  toolConsultarProdutoPorCodigo, 
  executeConsultarProdutoPorCodigo,
  toolConsultarProdutosPorTermo,
  executeConsultarProdutosPorTermo,
  toolAdicionarAoCarrinho,
  executeAdicionarAoCarrinho,
  toolVerCarrinho,
  executeVerCarrinho
} from './gemini_tools.js';

// Inicialização segura
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const toolDeclaration = {
  functionDeclarations: [toolConsultarProdutoPorCodigo, toolConsultarProdutosPorTermo, toolAdicionarAoCarrinho, toolVerCarrinho]
};

export async function processarMensagemGemini(mensagem: string, userId?: string) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY não configurada no servidor.');
  }

  // 1. Enviar mensagem para o Gemini interpretar a intenção
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: mensagem,
    config: {
      tools: [toolDeclaration],
      systemInstruction: "Você é o assistente virtual do sistema KIPSTOCK. Seu objetivo é ajudar vendedores a consultar estoques e gerenciar o carrinho (orçamento). Use as ferramentas para obter e salvar dados. NUNCA invente preços, códigos ou quantidades. Ao adicionar ao carrinho, é obrigatório informar o código da peça. Se não tiver, busque a peça por termo primeiro, exiba as opções e peça para o usuário confirmar o código ou apenas use o código se houver apenas uma correspondência evidente.",
      temperature: 0.1,
    }
  });

  // 2. Verificar se o modelo decidiu chamar uma ferramenta
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
          response.candidates![0].content, // Inclui parts completas com thoughtSignature
          { role: 'user', parts: [{ functionResponse: { name: call.name, response: dbResult } }] }
        ];

        const finalResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: history,
          config: {
            systemInstruction: "Formate os dados oficiais retornados pela ferramenta em uma resposta amigável e profissional. Se o retorno for uma lista de produtos ou um carrinho, use tabelas Markdown bem formatadas (incluindo Cód, Descrição, Qtd, Valor, Subtotal, etc.).",
            temperature: 0.2,
          }
        });
        
        return finalResponse.text;
      } catch (err: any) {
        console.error('[Gemini] Erro no fluxo secundário (formatação):', err.message);
        // Fallback seguro caso o LLM falhe na segunda chamada
        if (dbResult.status === 'sucesso') {
          return `Consulta realizada com sucesso. Dados encontrados:\n${JSON.stringify(dbResult.dados_oficiais, null, 2)}`;
        } else {
          return dbResult.mensagem;
        }
      }
    }
  }

  // Se não chamou ferramenta, devolve a resposta direta (ou indica que a intenção não pôde ser atendida com ferramentas de DB)
  return response.text;
}
