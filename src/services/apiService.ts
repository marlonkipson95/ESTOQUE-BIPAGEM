import { Product, ProductCodeHistory, DashboardStats, DatabaseHealth } from '../types';

class ApiService {
  private baseUrl = '/api';

  async getHealth(): Promise<DatabaseHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err: any) {
      return {
        status: 'error',
        database: 'disconnected',
        error: err.message || 'Falha de comunicação com a API',
      };
    }
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const res = await fetch(`${this.baseUrl}/dashboard/stats`);
    if (!res.ok) throw new Error('Falha ao obter estatísticas');
    return await res.json();
  }

  async scanCode(code: string): Promise<{
    status: 'found_current' | 'found_historical' | 'found_associated' | 'not_found';
    product?: Product;
    activeCodeType?: 'codigo_barras' | 'codigo_produto';
    scannedCode?: string;
    currentCode?: string;
    currentBarcode?: string;
    historicalRecord?: any;
    matchType?: string;
    newBarcode?: string;
    message?: string;
  }> {
    const res = await fetch(`${this.baseUrl}/produtos/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro na requisição de bipagem');
    }

    return await res.json();
  }

  async getProducts(params: {
    search?: string;
    corredor?: string;
    baia?: string;
    nivel?: string;
    locacao?: string;
    estoque?: string;
    cadastro?: string;
    tipoCodigo?: string;
    page?: number;
    limit?: number | string;
  } = {}): Promise<{ products: Product[]; total: number; page: number; limit: number }> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.corredor) query.set('corredor', params.corredor);
    if (params.baia) query.set('baia', params.baia);
    if (params.nivel) query.set('nivel', params.nivel);
    if (params.locacao) query.set('locacao', params.locacao);
    if (params.estoque && params.estoque !== 'todos') query.set('estoque', params.estoque);
    if (params.cadastro && params.cadastro !== 'todos') query.set('cadastro', params.cadastro);
    if (params.tipoCodigo && params.tipoCodigo !== 'todos') query.set('tipoCodigo', params.tipoCodigo);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    const res = await fetch(`${this.baseUrl}/produtos?${query.toString()}`);
    if (!res.ok) throw new Error('Falha ao listar produtos');
    return await res.json();
  }

  async getProduct(id: string): Promise<{ product: Product; history: ProductCodeHistory[] }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Produto não encontrado');
    return await res.json();
  }

  async createProduct(data: Partial<Product> & { descricao: string }): Promise<{ product: Product; isExisting?: boolean; message?: string }> {
    const res = await fetch(`${this.baseUrl}/produtos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar produto');
    }

    return await res.json();
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<{ product: Product; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar produto');
    }

    return await res.json();
  }

  // PATCH /api/produtos/:id/localizacao - Regra mandatória de alteração de localização
  async updateLocation(
    id: string,
    location: { corredor?: string; baia?: string; nivel?: string; locacao?: string; motivo?: string }
  ): Promise<{ product: Product; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/localizacao`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(location),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar localização física');
    }

    return await res.json();
  }

  // POST /api/produtos/:id/codigo - Regra mandatória de substituição com histórico
  async updateProductCode(
    id: string,
    tipo: 'codigo_barras' | 'codigo_produto' | 'codigo_fabrica',
    novo_codigo: string,
    motivo: string
  ): Promise<{ product: Product; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/codigo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, novo_codigo, motivo }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao alterar código do produto');
    }

    return await res.json();
  }

  async deleteProduct(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao excluir produto');
    }
    return await res.json();
  }

  async updateStock(
    id: string,
    data: { quantidade?: number; incremento?: number; motivo?: string; usuario?: string }
  ): Promise<{ product: Product; quantidade_anterior: number; quantidade_nova: number; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/estoque`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar estoque');
    }
    return await res.json();
  }

  async getRelatedProducts(id: string): Promise<{ relacionados: any[] }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/relacionados`);
    if (!res.ok) throw new Error('Falha ao carregar produtos relacionados');
    return await res.json();
  }

  async addRelatedProduct(id: string, relacionado_id: string, motivo?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/relacionados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relacionado_id, motivo }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao vincular produto relacionado');
    }
    return await res.json();
  }

  async removeRelatedProduct(id: string, relacionadoId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/relacionados/${encodeURIComponent(relacionadoId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao desvincular produto relacionado');
    }
    return await res.json();
  }

  async compareImport(items: any[]): Promise<{
    items: any[];
    summary: { total: number; novos: number; semAlteracao: number; comAlteracao: number };
  }> {
    const res = await fetch(`${this.baseUrl}/importar/comparar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao comparar planilha com banco de dados');
    }
    return await res.json();
  }

  async importBatch(payload: {
    items: Partial<Product>[];
    fileName?: string;
    preserveExistingLocation?: boolean;
    archiveOldBarcodesInHistory?: boolean;
  }): Promise<{ total: number; novos: number; atualizados: number; erros: number }> {
    const res = await fetch(`${this.baseUrl}/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao processar lote de importação');
    }

    return await res.json();
  }
}

export const apiService = new ApiService();
