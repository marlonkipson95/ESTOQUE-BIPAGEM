import { Router, Request, Response } from 'express';

export const cosmosRouter = Router();

export interface CosmosProductData {
  gtin: string | number;
  description: string;
  brand?: string;
  ncm?: string;
  thumbnail?: string;
}

export interface CosmosFetchResponse {
  success: boolean;
  status: number;
  data: CosmosProductData | null;
  message?: string;
}

/**
 * Consulta a API da Bluesoft Cosmos com o GTIN/EAN informado.
 * Utiliza o token em variável de ambiente no backend para manter a credencial protegida.
 */
export async function fetchCosmosProduct(gtin: string): Promise<CosmosFetchResponse> {
  const token = process.env.COSMOS_API_TOKEN;
  if (!token) {
    return {
      success: false,
      status: 500,
      data: null,
      message: 'Token COSMOS_API_TOKEN não configurado no servidor.',
    };
  }

  const userAgent = process.env.COSMOS_USER_AGENT || 'Cosmos-API-Request';
  const cleanGtin = (gtin || '').trim().replace(/[\s\.-]/g, '');

  if (!cleanGtin) {
    return {
      success: false,
      status: 400,
      data: null,
      message: 'GTIN/EAN inválido ou vazio.',
    };
  }

  try {
    const url = `https://cosmos.bluesoft.com.br/api/gtins/${cleanGtin}.json`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Cosmos-Token': token,
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 200) {
      const json: any = await response.json();
      return {
        success: true,
        status: 200,
        data: {
          gtin: json.gtin || cleanGtin,
          description: json.description || '',
          brand: json.brand?.name || (typeof json.brand === 'string' ? json.brand : undefined),
          ncm: json.ncm?.code || (typeof json.ncm === 'string' ? json.ncm : undefined),
          thumbnail: json.thumbnail || json.thumbnail_url || undefined,
        },
      };
    }

    if (response.status === 404) {
      return {
        success: true,
        status: 404,
        data: null,
        message: 'Produto não cadastrado na base do Bluesoft Cosmos.',
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        data: null,
        message: 'Cota diária gratuita (25 consultas/dia) atingida hoje. O código foi extraído normalmente; apenas informe a descrição na mão.',
      };
    }

    const errorBody = await response.text().catch(() => '');
    return {
      success: false,
      status: response.status,
      data: null,
      message: `Resposta inesperada da API Cosmos (HTTP ${response.status}): ${errorBody.slice(0, 150)}`,
    };
  } catch (error: any) {
    console.error('[Cosmos API] Falha na requisição:', error.message);
    return {
      success: false,
      status: 500,
      data: null,
      message: `Erro de conexão com o Bluesoft Cosmos: ${error.message}`,
    };
  }
}

// Endpoint GET /api/cosmos/gtin/:gtin
cosmosRouter.get('/gtin/:gtin', async (req: Request, res: Response) => {
  const { gtin } = req.params;
  if (!gtin) {
    return res.status(400).json({ error: 'Parâmetro GTIN é obrigatório' });
  }

  const result = await fetchCosmosProduct(gtin);
  return res.status(result.status === 404 ? 200 : result.status).json(result);
});
