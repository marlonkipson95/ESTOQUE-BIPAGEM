import { getDbPool } from './db.js';
import { Type } from '@google/genai';

// ==========================================
// DEFINIÇÃO DAS FERRAMENTAS DO GEMINI
// ==========================================

export const toolConsultarProdutoPorCodigo = {
  name: 'consultar_produto_por_codigo',
  description: 'Consulta um produto no banco de dados através do seu código exato (código interno, de fábrica ou de barras). Retorna estoque contábil, estoque físico, diferença, NCM, data de última compra/venda, localização e preços.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      codigo: {
        type: Type.STRING,
        description: 'O código do produto a ser consultado (ex: 70200821, 922503600034E, 789123456).'
      }
    },
    required: ['codigo']
  }
};

export const toolConsultarProdutosPorTermo = {
  name: 'consultar_produtos_por_termo',
  description: 'Busca produtos pela descrição textual aproximada. Use quando o usuário procurar por nome, característica ou categoria. Retorna até 10 itens com estoque contábil, físico, NCM, última compra e localização.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      termo: {
        type: Type.STRING,
        description: 'O termo de busca (ex: "mangueira", "parafuso cabecote", "anel trava").'
      }
    },
    required: ['termo']
  }
};

export const toolConsultarProdutosPorCorredor = {
  name: 'consultar_produtos_por_corredor',
  description: 'Consulta produtos situados em um determinado corredor (e opcionalmente baia/nível) no estoque, permitindo filtrar por preço máximo ou se tem estoque disponível. Retorna tabela com produtos, estoque contábil, físico, localização, preços e última compra.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      corredor: {
        type: Type.STRING,
        description: 'Número ou identificador do corredor (ex: "01", "02", "03").'
      },
      preco_maximo: {
        type: Type.NUMBER,
        description: 'Opcional. Valor máximo de preço mínimo ou sugerido (ex: 10 para buscar produtos de até R$ 10,00).'
      },
      apenas_com_estoque: {
        type: Type.BOOLEAN,
        description: 'Opcional. Se true, filtra apenas produtos com estoque contábil ou físico maior que zero.'
      },
      limite: {
        type: Type.NUMBER,
        description: 'Opcional. Quantidade máxima de produtos a retornar (padrão 10, máximo 25).'
      }
    },
    required: ['corredor']
  }
};

export const toolConsultarRankingEstoque = {
  name: 'consultar_ranking_estoque',
  description: 'Consulta os produtos com maior ou menor estoque (contábil ou físico) no almoxarifado. Use quando o usuário perguntar quais produtos têm mais/menos estoque.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      tipo_estoque: {
        type: Type.STRING,
        description: 'Tipo de estoque a ordenar: "contabil" ou "fisico". Padrão é "contabil".'
      },
      ordem: {
        type: Type.STRING,
        description: 'Sentido da ordenação: "maior" (do maior para o menor) ou "menor" (do menor para o maior). Padrão é "maior".'
      },
      corredor: {
        type: Type.STRING,
        description: 'Opcional. Restringir a busca a um corredor específico.'
      },
      limite: {
        type: Type.NUMBER,
        description: 'Opcional. Número de itens a retornar (padrão 10, máximo 20).'
      }
    },
    required: []
  }
};

export const toolAdicionarAoCarrinho = {
  name: 'adicionar_ao_carrinho',
  description: 'Adiciona um produto ao carrinho (orçamento pendente) do usuário atual. Use quando o vendedor pedir para adicionar, cotar ou incluir itens.',
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
};

// ==========================================
// IMPLEMENTAÇÃO (DATA-GROUNDED)
// ==========================================

export async function executeConsultarProdutoPorCodigo(codigo: string): Promise<any> {
  const pool = getDbPool();
  if (!pool) return { status: 'erro', mensagem: 'Banco de dados indisponível no momento.' };
  
  const clean = codigo.trim().replace(/[?!.,;]/g, '');
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, 
              quantidade as estoque_contabil, 
              COALESCE(estoque_fisico, 0) as estoque_fisico,
              (COALESCE(estoque_fisico, 0) - COALESCE(quantidade, 0)) as diferenca_estoque,
              COALESCE(ncm, '') as ncm,
              COALESCE(ultima_data_compra, '') as ultima_data_compra,
              COALESCE(ultima_data_venda, '') as ultima_data_venda,
              corredor, baia, nivel, locacao, 
              preco_sugerido, preco_minimo, preco_tabela, custo_unitario
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1) 
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
       LIMIT 1`,
      [clean]
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
    const clean = termo.trim().replace(/[?!.,;]/g, '');
    const termos = clean.split(/\s+/).filter(t => t.length > 0);
    if (termos.length === 0) {
      return { status: 'erro', mensagem: 'Termo de busca vazio.' };
    }

    let queryStr = `SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, 
                           quantidade as estoque_contabil, 
                           COALESCE(estoque_fisico, 0) as estoque_fisico,
                           (COALESCE(estoque_fisico, 0) - COALESCE(quantidade, 0)) as diferenca_estoque,
                           COALESCE(ncm, '') as ncm,
                           COALESCE(ultima_data_compra, '') as ultima_data_compra,
                           COALESCE(ultima_data_venda, '') as ultima_data_venda,
                           corredor, baia, nivel, locacao, 
                           preco_sugerido, preco_minimo, preco_tabela 
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

export async function executeConsultarProdutosPorCorredor(
  corredor: string,
  preco_maximo?: number,
  apenas_com_estoque?: boolean,
  limite: number = 10
): Promise<any> {
  const pool = getDbPool();
  if (!pool) return { status: 'erro', mensagem: 'Banco de dados indisponível no momento.' };

  const client = await pool.connect();
  try {
    const lim = Math.min(25, Math.max(1, limite || 10));
    const cleanCorredor = corredor.trim().padStart(2, '0');
    
    const conditions: string[] = ['(corredor = $1 OR corredor = $2)'];
    const values: any[] = [cleanCorredor, corredor.trim()];
    let paramIdx = 3;

    if (preco_maximo !== undefined && preco_maximo > 0) {
      conditions.push(`(preco_minimo <= $${paramIdx} OR preco_sugerido <= $${paramIdx})`);
      values.push(preco_maximo);
      paramIdx++;
    }

    if (apenas_com_estoque) {
      conditions.push('(quantidade > 0 OR estoque_fisico > 0)');
    }

    values.push(lim);
    const query = `
      SELECT codigo_atual, codigo_fabrica, descricao,
             quantidade as estoque_contabil,
             COALESCE(estoque_fisico, 0) as estoque_fisico,
             COALESCE(ncm, '') as ncm,
             COALESCE(ultima_data_compra, '') as ultima_data_compra,
             corredor, baia, nivel, locacao,
             preco_sugerido, preco_minimo
      FROM produtos
      WHERE ${conditions.join(' AND ')}
      ORDER BY baia ASC, nivel ASC, descricao ASC
      LIMIT $${paramIdx}
    `;

    const res = await client.query(query, values);
    return {
      status: 'sucesso',
      total_encontrados: res.rows.length,
      corredor: cleanCorredor,
      produtos: res.rows
    };
  } catch (err: any) {
    console.error('[GeminiTools] Erro ao consultar_produtos_por_corredor:', err);
    return { status: 'erro', mensagem: 'Falha interna ao consultar produtos do corredor.' };
  } finally {
    client.release();
  }
}

export async function executeConsultarRankingEstoque(
  tipo_estoque: string = 'contabil',
  ordem: string = 'maior',
  corredor?: string,
  limite: number = 10
): Promise<any> {
  const pool = getDbPool();
  if (!pool) return { status: 'erro', mensagem: 'Banco de dados indisponível no momento.' };

  const client = await pool.connect();
  try {
    const lim = Math.min(20, Math.max(1, limite || 10));
    const campo = tipo_estoque === 'fisico' ? 'COALESCE(estoque_fisico, 0)' : 'COALESCE(quantidade, 0)';
    const dir = ordem === 'menor' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (corredor && corredor.trim()) {
      const cleanCorr = corredor.trim().padStart(2, '0');
      conditions.push(`(corredor = $${paramIdx} OR corredor = $${paramIdx + 1})`);
      values.push(cleanCorr, corredor.trim());
      paramIdx += 2;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(lim);

    const query = `
      SELECT codigo_atual, codigo_fabrica, descricao,
             quantidade as estoque_contabil,
             COALESCE(estoque_fisico, 0) as estoque_fisico,
             (COALESCE(estoque_fisico, 0) - COALESCE(quantidade, 0)) as diferenca_estoque,
             COALESCE(ncm, '') as ncm,
             COALESCE(ultima_data_compra, '') as ultima_data_compra,
             corredor, baia, nivel, locacao
      FROM produtos
      ${whereClause}
      ORDER BY ${campo} ${dir}
      LIMIT $${paramIdx}
    `;

    const res = await client.query(query, values);
    return {
      status: 'sucesso',
      tipo_ordenacao: `${tipo_estoque} (${ordem})`,
      total_retornados: res.rows.length,
      produtos: res.rows
    };
  } catch (err: any) {
    console.error('[GeminiTools] Erro ao consultar_ranking_estoque:', err);
    return { status: 'erro', mensagem: 'Falha interna ao consultar ranking de estoque.' };
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
