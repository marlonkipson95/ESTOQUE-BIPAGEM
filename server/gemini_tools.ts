import { getDbPool } from './db.js';

import { Type } from '@google/genai';

// ==========================================
// DEFINIÇÃO DAS FERRAMENTAS DO GEMINI
// ==========================================

export const toolConsultarProdutoPorCodigo = {
  name: 'consultar_produto_por_codigo',
  description: 'Consulta um produto no banco de dados através do seu código exato (interno ou de fábrica). Use para buscar informações precisas de estoque, preço e localização quando o usuário perguntar sobre um código específico.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      codigo: {
        type: Type.STRING,
        description: 'O código do produto a ser consultado (ex: 70200821, XYZ-123).'
      }
    },
    required: ['codigo']
  }
};

export const toolConsultarProdutosPorTermo = {
  name: 'consultar_produtos_por_termo',
  description: 'Busca produtos pela descrição textual aproximada. Use quando o usuário procurar por nome, característica ou categoria em vez de um código numérico. Retorna no máximo 10 itens.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      termo: {
        type: Type.STRING,
        description: 'O termo de busca (ex: "mangueira", "parafuso 10mm", "óleo motor").'
      }
    },
    required: ['termo']
  }
};

export const toolAdicionarAoCarrinho = {
  name: 'adicionar_ao_carrinho',
  description: 'Adiciona um produto ao carrinho (orçamento pendente) do usuário atual. Use quando o vendedor pedir para separar, adicionar ou cotar uma certa quantidade de uma peça. Importante: Você deve informar o código do produto que o usuário quer adicionar. Se o usuário forneceu apenas o nome, você DEVE consultar os produtos por termo primeiro e, em seguida, usar o código retornado na consulta para adicionar ao carrinho.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      codigo: {
        type: Type.STRING,
        description: 'O código interno ou de fábrica do produto a ser adicionado.'
      },
      quantidade: {
        type: Type.NUMBER,
        description: 'A quantidade de peças a serem adicionadas.'
      },
      preco_unitario: {
        type: Type.NUMBER,
        description: 'Opcional. Preço negociado (unitário). Se não informado, o sistema utilizará o preço sugerido do sistema.'
      }
    },
    required: ['codigo', 'quantidade']
  }
};

export const toolVerCarrinho = {
  name: 'ver_carrinho',
  description: 'Visualiza os itens atualmente no carrinho (orçamento pendente) do usuário logado, junto com o total.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: []
  }
};
// ==========================================
// IMPLEMENTAÇÃO (DATA-GROUNDED)
// ==========================================

export async function executeConsultarProdutoPorCodigo(codigo: string): Promise<any> {
  const pool = getDbPool();
  if (!pool) return { status: 'erro', mensagem: 'Banco de dados indisponível no momento.' };
  
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, codigo_atual, codigo_fabrica, descricao, quantidade, corredor, baia, nivel, locacao, preco_sugerido, preco_minimo, preco_tabela
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1) 
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
       LIMIT 1`,
      [codigo.trim()]
    );
    
    if (res.rows.length === 0) {
      return { 
        status: 'não encontrado', 
        mensagem: `Nenhum produto cadastrado no sistema corresponde ao código exato "${codigo}".` 
      };
    }
    
    return {
      status: 'sucesso',
      dados_oficiais: res.rows[0]
    };
  } catch (err: any) {
    console.error('[GeminiTools] Erro ao consultar_produto_por_codigo:', err);
    return { status: 'erro', mensagem: 'Falha interna ao consultar o banco de dados.' };
  } finally {
    client.release();
  }
}

export async function executeConsultarProdutosPorTermo(termo: string): Promise<any> {
  const pool = getDbPool();
  if (!pool) return { status: 'erro', mensagem: 'Banco de dados indisponível no momento.' };
  
  const client = await pool.connect();
  try {
    const termos = termo.trim().split(/\s+/).filter(t => t.length > 0);
    if (termos.length === 0) {
      return { status: 'erro', mensagem: 'Termo de busca vazio.' };
    }

    let queryStr = `SELECT id, codigo_atual, codigo_fabrica, descricao, quantidade, locacao, preco_sugerido, preco_minimo 
                    FROM produtos WHERE `;
    const conditions: string[] = [];
    const values: any[] = [];
    
    termos.forEach((t, i) => {
      conditions.push(`descricao ILIKE $${i + 1}`);
      values.push(`%${t}%`);
    });
    
    queryStr += conditions.join(' AND ') + ` ORDER BY descricao ASC LIMIT 10`;

    const res = await client.query(queryStr, values);
    
    if (res.rows.length === 0) {
      return { 
        status: 'não encontrado', 
        mensagem: `Nenhum produto cadastrado corresponde à busca "${termo}".` 
      };
    }
    
    return {
      status: 'sucesso',
      quantidade_encontrada: res.rows.length,
      dados_oficiais: res.rows
    };
  } catch (err: any) {
    console.error('[GeminiTools] Erro ao consultar_produtos_por_termo:', err);
    return { status: 'erro', mensagem: 'Falha interna ao consultar o banco de dados.' };
  } finally {
    client.release();
  }
}

export async function executeAdicionarAoCarrinho(codigo: string, quantidade: number, preco_unitario: number | null, userId: number): Promise<any> {
  const pool = getDbPool();
  if (!pool) return { status: 'erro', mensagem: 'Banco de dados indisponível no momento.' };

  const client = await pool.connect();
  try {
    // 1. Validar e buscar produto
    const resProd = await client.query(
      `SELECT id, codigo_atual, codigo_fabrica, descricao, preco_sugerido, preco_minimo 
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1) 
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
       LIMIT 1`,
      [codigo.trim()]
    );

    if (resProd.rows.length === 0) {
      return { status: 'erro', mensagem: `Produto com código "${codigo}" não encontrado no sistema.` };
    }

    const produto = resProd.rows[0];
    
    // 2. Definir o preço e validar limites
    const preco = preco_unitario || parseFloat(produto.preco_sugerido || 0);
    const precoMinimo = parseFloat(produto.preco_minimo || 0);

    if (preco < precoMinimo) {
      return { 
        status: 'erro', 
        mensagem: `Bloqueado: O preço R$ ${preco.toFixed(2)} está abaixo do mínimo permitido (R$ ${precoMinimo.toFixed(2)}) para "${produto.descricao}".` 
      };
    }

    const subtotal = preco * quantidade;

    // 3. Recuperar ou criar carrinho do usuário
    const resCart = await client.query(
      `SELECT itens, total_orcamento FROM orcamentos_pendentes WHERE user_id = $1`,
      [userId]
    );

    let itens = [];
    let total_orcamento = 0;

    if (resCart.rows.length > 0) {
      itens = resCart.rows[0].itens;
      total_orcamento = parseFloat(resCart.rows[0].total_orcamento || 0);
    }

    // 4. Adicionar novo item
    const newItem = {
      produto_id: produto.id,
      codigo: produto.codigo_fabrica || produto.codigo_atual,
      descricao: produto.descricao,
      quantidade: quantidade,
      preco_unitario: preco,
      subtotal: subtotal
    };

    itens.push(newItem);
    total_orcamento += subtotal;

    // 5. Salvar de volta
    await client.query(`
      INSERT INTO orcamentos_pendentes (user_id, itens, total_orcamento, atualizado_em)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET itens = EXCLUDED.itens, total_orcamento = EXCLUDED.total_orcamento, atualizado_em = NOW()
    `, [userId, JSON.stringify(itens), total_orcamento]);

    return {
      status: 'sucesso',
      mensagem: `"${produto.descricao}" adicionado ao carrinho com sucesso.`,
      item_adicionado: newItem,
      carrinho_total_itens: itens.length,
      carrinho_valor_total: total_orcamento
    };
  } catch (err: any) {
    console.error('[GeminiTools] Erro ao adicionar_ao_carrinho:', err);
    return { status: 'erro', mensagem: 'Falha interna ao manipular o carrinho de compras no banco.' };
  } finally {
    client.release();
  }
}

export async function executeVerCarrinho(userId: number): Promise<any> {
  const pool = getDbPool();
  if (!pool) return { status: 'erro', mensagem: 'Banco de dados indisponível no momento.' };

  const client = await pool.connect();
  try {
    const resCart = await client.query(
      `SELECT itens, total_orcamento FROM orcamentos_pendentes WHERE user_id = $1`,
      [userId]
    );

    if (resCart.rows.length === 0 || !resCart.rows[0].itens || resCart.rows[0].itens.length === 0) {
      return { status: 'sucesso', mensagem: 'O carrinho está vazio.' };
    }

    return {
      status: 'sucesso',
      carrinho: resCart.rows[0].itens,
      total_orcamento: parseFloat(resCart.rows[0].total_orcamento)
    };
  } catch (err: any) {
    console.error('[GeminiTools] Erro ao ver_carrinho:', err);
    return { status: 'erro', mensagem: 'Falha ao buscar o carrinho no banco de dados.' };
  } finally {
    client.release();
  }
}
