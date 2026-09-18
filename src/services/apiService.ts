import { Product, ProductCodeHistory, DashboardStats, DatabaseHealth, QuickList, QuickListItem } from '../types';

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

  // POST /api/produtos/:id/vincular-codigo - Vínculo de múltiplos códigos sem apagar anteriores
  async vincularCodigo(
    id: string,
    codigo: string,
    tipo: 'codigo_barras' | 'codigo_produto' | 'codigo_fabrica' = 'codigo_barras',
    motivo: string = 'Código de barras adicional vinculado'
  ): Promise<{ success: boolean; product: Product; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/vincular-codigo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, tipo, motivo }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao vincular código ao produto');
    }

    return await res.json();
  }

  async desvincularCodigoBarras(
    id: string,
    motivo: string = 'Código de barras desvinculado manualmente'
  ): Promise<{ success: boolean; product: Product; message: string }> {
    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/desvincular-codigo-barras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao desvincular código de barras');
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

  async addRelatedProduct(
    id: string,
    params: { relacionado_id?: string; codigo?: string; codigo_generico?: string; motivo?: string } | string,
    motivoParam?: string
  ): Promise<{ success: boolean; message: string }> {
    const payload = typeof params === 'string'
      ? { relacionado_id: params, motivo: motivoParam }
      : params;

    const res = await fetch(`${this.baseUrl}/produtos/${encodeURIComponent(id)}/relacionados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

  // =====================================
  // ORÇAMENTOS (Com suporte a Modo Offline)
  // =====================================

  private getOfflineOrcamentosQueue(): import('../types').Orcamento[] {
    try {
      const stored = localStorage.getItem('kipstock_offline_orcamentos');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveOfflineOrcamentosQueue(queue: import('../types').Orcamento[]): void {
    try {
      localStorage.setItem('kipstock_offline_orcamentos', JSON.stringify(queue));
    } catch (e) {
      console.error('Falha ao salvar fila offline:', e);
    }
  }

  async syncOfflineQueue(): Promise<{ synced: number }> {
    if (!navigator.onLine) return { synced: 0 };
    const queue = this.getOfflineOrcamentosQueue();
    if (queue.length === 0) return { synced: 0 };

    let synced = 0;
    const remaining: import('../types').Orcamento[] = [];

    for (const item of queue) {
      try {
        const res = await fetch(`${this.baseUrl}/orcamentos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (res.ok) {
          synced++;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    this.saveOfflineOrcamentosQueue(remaining);
    return { synced };
  }

  async getOrcamentos(): Promise<import('../types').Orcamento[]> {
    const offlineItems = this.getOfflineOrcamentosQueue();
    try {
      const res = await fetch(`${this.baseUrl}/orcamentos`);
      if (res.ok) {
        const serverItems: import('../types').Orcamento[] = await res.json();
        // Sincronizar itens pendentes em background se houver
        if (offlineItems.length > 0 && navigator.onLine) {
          this.syncOfflineQueue().catch(() => {});
        }
        // Retornar mesclando com itens offline que ainda não subiram
        const serverIds = new Set(serverItems.map(s => s.id));
        const unuploaded = offlineItems.filter(o => !serverIds.has(o.id));
        return [...unuploaded, ...serverItems];
      }
    } catch (e) {
      console.warn('[Offline] Servidor inacessível, retornando orçamentos offline locais.');
    }
    return offlineItems;
  }

  async salvarOrcamento(orcamento: Partial<import('../types').Orcamento>): Promise<{ success: boolean; orcamento?: import('../types').Orcamento; offline?: boolean }> {
    const fullOrcamento: import('../types').Orcamento = {
      id: orcamento.id || `temp-${Date.now()}`,
      nome_cliente: orcamento.nome_cliente || '',
      responsavel: orcamento.responsavel || 'Marlon',
      itens: orcamento.itens || [],
      total_orcamento: orcamento.total_orcamento || 0,
      criado_em: orcamento.criado_em || new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      const queue = this.getOfflineOrcamentosQueue();
      const idx = queue.findIndex(q => q.id === fullOrcamento.id);
      if (idx >= 0) queue[idx] = fullOrcamento;
      else queue.unshift(fullOrcamento);
      this.saveOfflineOrcamentosQueue(queue);
      return { success: true, orcamento: fullOrcamento, offline: true };
    }

    try {
      const res = await fetch(`${this.baseUrl}/orcamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orcamento),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao salvar orçamento');
      }
      return await res.json();
    } catch (err: any) {
      // Contingência Offline
      const queue = this.getOfflineOrcamentosQueue();
      const idx = queue.findIndex(q => q.id === fullOrcamento.id);
      if (idx >= 0) queue[idx] = fullOrcamento;
      else queue.unshift(fullOrcamento);
      this.saveOfflineOrcamentosQueue(queue);
      return { success: true, orcamento: fullOrcamento, offline: true };
    }
  }

  async excluirOrcamento(id: string): Promise<void> {
    // Remover da fila offline se existir
    const queue = this.getOfflineOrcamentosQueue().filter(q => q.id !== id);
    this.saveOfflineOrcamentosQueue(queue);

    if (navigator.onLine) {
      try {
        const res = await fetch(`${this.baseUrl}/orcamentos/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Falha ao excluir orçamento');
        }
      } catch (err: any) {
        console.warn('Exclusão remota falhou ou em contingência:', err.message);
      }
    }
  }

  // =====================================
  // AUDITORIA E RASTREABILIDADE
  // =====================================

  async getAuditoria(search?: string): Promise<import('../types').AuditoriaRecord[]> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`${this.baseUrl}/auditoria${query}`);
    if (!res.ok) throw new Error('Falha ao carregar registros de auditoria');
    const data = await res.json();
    return data.registros || [];
  }

  async reverterAuditoria(id: number, usuario: string = 'Programador / Admin'): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/auditoria/reverter/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao reverter alteração');
    }
    return await res.json();
  }

  // =====================================
  // CONSULTA EXTERNA BLUESOFT COSMOS (GTIN / EAN)
  // =====================================

  async consultarCosmos(gtin: string): Promise<{
    success: boolean;
    status: number;
    data: {
      gtin: string | number;
      description: string;
      brand?: string;
      ncm?: string;
      thumbnail?: string;
    } | null;
    message?: string;
  }> {
    try {
      const clean = (gtin || '').trim().replace(/[\s\.-]/g, '');
      const res = await fetch(`${this.baseUrl}/cosmos/gtin/${encodeURIComponent(clean)}`);
      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        data: null,
        message: err.message || 'Falha de comunicação com o servidor ao consultar Cosmos.',
      };
    }
  }

  // =====================================
  // ANOTAÇÕES RÁPIDAS / LISTAS RÁPIDAS
  // =====================================

  async getListasRapidas(): Promise<QuickList[]> {
    try {
      const res = await fetch(`${this.baseUrl}/listas-rapidas`);
      if (!res.ok) throw new Error('Falha ao carregar listas rápidas');
      return await res.json();
    } catch (err: any) {
      console.error('[ApiService] Erro ao buscar listas rápidas:', err);
      return [];
    }
  }

  async getListaRapidaById(id: number): Promise<QuickList | null> {
    try {
      const res = await fetch(`${this.baseUrl}/listas-rapidas/${id}`);
      if (!res.ok) throw new Error('Lista não encontrada');
      return await res.json();
    } catch (err: any) {
      console.error('[ApiService] Erro ao buscar lista por ID:', err);
      return null;
    }
  }

  async salvarListaRapida(lista: Partial<QuickList>): Promise<{ success: boolean; lista?: QuickList; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/listas-rapidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lista),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar lista rápida');
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async excluirListaRapida(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/listas-rapidas/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao excluir lista rápida');
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async lookupItemRapido(code: string): Promise<{
    found: boolean;
    codigo?: string;
    descricao?: string;
    locacao?: string;
    quantidade?: number;
  }> {
    try {
      const clean = encodeURIComponent((code || '').trim());
      const res = await fetch(`${this.baseUrl}/listas-rapidas/lookup-item/${clean}`);
      if (!res.ok) return { found: false };
      return await res.json();
    } catch {
      return { found: false };
    }
  }
}

export const apiService = new ApiService();

