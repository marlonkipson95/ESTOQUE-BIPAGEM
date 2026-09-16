import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Barcode,
  History,
  Save,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Shield,
  Clock,
  Layers,
  Trash2,
  Link2,
  Unlink,
  Search,
  Boxes,
  DollarSign,
  Tag,
} from 'lucide-react';
import { Product, ProductCodeHistory, CodeType } from '../../types';
import { storageService } from '../../services/storageService';
import { apiService } from '../../services/apiService';
import { beepService } from '../../services/beepService';
import { LocationBadge } from '../common/LocationBadge';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onProductUpdated: (updated: Product) => void;
  onProductDeleted?: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onProductUpdated,
  onProductDeleted,
}) => {
  const [currentProduct, setCurrentProduct] = useState<Product>(product);
  const [activeTab, setActiveTab] = useState<'info' | 'location' | 'history' | 'relacionados'>('info');

  // Form states for basic info & location
  const [descricao, setDescricao] = useState(product.descricao);
  const [codigoFabrica, setCodigoFabrica] = useState(product.codigo_fabrica || '');
  const [codigosAlternativos, setCodigosAlternativos] = useState(
    Array.isArray(product.codigos_alternativos)
      ? product.codigos_alternativos.join(', ')
      : product.codigos_alternativos || ''
  );
  const [quantidade, setQuantidade] = useState(product.quantidade);
  const [estoqueMinimo, setEstoqueMinimo] = useState(product.estoque_minimo || 5);

  const [custoUnitario, setCustoUnitario] = useState<number | string>(product.custo_unitario ?? 0);
  const [precoTabela, setPrecoTabela] = useState<number | string>(product.preco_tabela ?? 0);
  const [precoSugerido, setPrecoSugerido] = useState<number | string>(product.preco_sugerido ?? 0);
  const [precoMinimo, setPrecoMinimo] = useState<number | string>(product.preco_minimo ?? 0);

  const [corredor, setCorredor] = useState(product.corredor || '');
  const [baia, setBaia] = useState(product.baia || '');
  const [nivel, setNivel] = useState(product.nivel || '');
  const [locacao, setLocacao] = useState(product.locacao || '');

  // New Code Replacement state
  const [showReplaceCodeModal, setShowReplaceCodeModal] = useState(false);
  const [newCodeType, setNewCodeType] = useState<CodeType>('codigo_barras');
  const [newCodeValue, setNewCodeValue] = useState('');
  const [newCodeReason, setNewCodeReason] = useState('Substituição pelo operador no painel do produto');

  // Related products state
  const [relatedList, setRelatedList] = useState<any[]>(product.produtos_relacionados || []);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [selectedRelProductId, setSelectedRelProductId] = useState('');
  const [relMotivo, setRelMotivo] = useState('Peça genérica / compatível');
  const [searchRelTerm, setSearchRelTerm] = useState('');

  // Delete product state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback notifications
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Retrieve full code history for this product
  const historyList = storageService.getProductHistory(product.id);

  // Load related products on mount and tab switch
  const loadRelated = async () => {
    setIsLoadingRelated(true);
    try {
      const res = await apiService.getRelatedProducts(currentProduct.id);
      if (res && res.relacionados) {
        setRelatedList(res.relacionados);
      }
    } catch {
      // Fallback to local
      setRelatedList(currentProduct.produtos_relacionados || []);
    } finally {
      setIsLoadingRelated(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'relacionados') {
      loadRelated();
    }
  }, [activeTab]);

  // Save basic info and location (never changing ID!)
  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();

    const altArray = codigosAlternativos
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const productPayload = {
      ...currentProduct,
      descricao: descricao.trim(),
      codigo_fabrica: codigoFabrica.trim(),
      codigos_alternativos: altArray,
      custo_unitario: Number(custoUnitario) || 0,
      preco_tabela: Number(precoTabela) || 0,
      preco_sugerido: Number(precoSugerido) || 0,
      preco_minimo: Number(precoMinimo) || 0,
      quantidade: Number(quantidade) || 0,
      estoqueMinimo: Number(estoqueMinimo) || 5,
      corredor: corredor.trim(),
      baia: baia.trim(),
      nivel: nivel.trim(),
      locacao: locacao.trim() || (corredor || baia || nivel ? `${corredor}-${baia}-${nivel}`.replace(/^-|-$/g, '') : ''),
      atualizado_em: new Date().toISOString(),
    };

    const updated = storageService.updateProduct(productPayload);

    // Sync in background with PostgreSQL
    apiService.updateProduct(currentProduct.id, productPayload).catch(err => {
      console.warn('[DB] Atualização remota falhou, dados preservados no storage local:', err.message);
    });

    if (updated) {
      setCurrentProduct(updated);
      onProductUpdated(updated);
      beepService.playSuccess();
      setFeedbackMsg({ type: 'success', text: 'Dados e localização física salvos com sucesso!' });
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  // Quick Stock delta
  const handleQuickStockChange = async (delta: number) => {
    const newQty = Math.max(0, quantidade + delta);
    setQuantidade(newQty);
    const res = await storageService.updateStock(
      currentProduct.id,
      { quantidade: newQty },
      `Ajuste de estoque no painel (${delta > 0 ? '+' : ''}${delta})`
    );
    if (res.product) {
      setCurrentProduct(res.product);
      onProductUpdated(res.product);
      beepService.playSuccess();
      setFeedbackMsg({ type: 'success', text: `Estoque ajustado para ${newQty} un.` });
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  // Add related generic product
  const handleAddRelated = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetIdOrCode = selectedRelProductId || searchRelTerm.trim();
    if (!targetIdOrCode) return;

    try {
      if (selectedRelProductId) {
        await apiService.addRelatedProduct(currentProduct.id, selectedRelProductId, relMotivo);
      } else {
        await apiService.addRelatedProduct(currentProduct.id, {
          codigo: searchRelTerm.trim(),
          motivo: relMotivo,
        });
      }
      beepService.playSuccess();
      setFeedbackMsg({ type: 'success', text: 'Código genérico associado com sucesso!' });
      setSelectedRelProductId('');
      setSearchRelTerm('');
      loadRelated();
    } catch (err: any) {
      beepService.playError();
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao associar produto relacionado' });
    }
  };

  // Remove related product
  const handleRemoveRelated = async (relId: string) => {
    try {
      await apiService.removeRelatedProduct(currentProduct.id, relId);
      beepService.playSuccess();
      setFeedbackMsg({ type: 'success', text: 'Vínculo removido com sucesso!' });
      loadRelated();
    } catch (err: any) {
      beepService.playError();
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao remover vínculo' });
    }
  };

  // Delete product safely
  const handleDeleteProduct = async () => {
    setIsDeleting(true);
    try {
      await storageService.deleteProduct(currentProduct.id);
      beepService.playWarning();
      setShowDeleteModal(false);
      onProductDeleted?.();
      onClose();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Falha ao excluir produto' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Execute safe code replacement (preserves previous code in history!)
  const handleExecuteReplaceCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCodeValue.trim()) return;

    const res = storageService.updateProductCode(
      currentProduct.id,
      newCodeType,
      newCodeValue.trim(),
      newCodeReason.trim()
    );

    // Sync in background with PostgreSQL
    apiService.updateProductCode(
      currentProduct.id,
      newCodeType,
      newCodeValue.trim(),
      newCodeReason.trim()
    ).catch(err => {
      console.warn('[DB] Substituição de código remota falhou, preservada no storage local:', err.message);
    });

    if (res.success && res.product) {
      setCurrentProduct(res.product);
      onProductUpdated(res.product);
      setShowReplaceCodeModal(false);
      setNewCodeValue('');
      beepService.playSuccess();
      setFeedbackMsg({ type: 'success', text: 'Novo código ativado e código antigo arquivado no histórico!' });
      setTimeout(() => setFeedbackMsg(null), 3500);
    } else {
      beepService.playError();
      setFeedbackMsg({ type: 'error', text: res.message || res.error || 'Erro ao atualizar código.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 md:p-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 sm:px-5 py-3 sm:py-4 dark:border-slate-800 dark:bg-slate-900/90 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0">
              <Barcode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 block">
                {currentProduct.codigo_fabrica ? `Cód. Fábrica: ${currentProduct.codigo_fabrica}` : currentProduct.codigo_atual}
              </span>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {currentProduct.descricao}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white transition shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            className={`px-5 py-2.5 text-xs font-semibold flex items-center gap-2 ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-5 text-xs font-semibold dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <button
            onClick={() => setActiveTab('info')}
            className={`border-b-2 py-3 px-3 transition whitespace-nowrap ${
              activeTab === 'info'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Dados & Estoque
          </button>
          <button
            onClick={() => setActiveTab('location')}
            className={`border-b-2 py-3 px-3 transition whitespace-nowrap ${
              activeTab === 'location'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Localização Física
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`border-b-2 py-3 px-3 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Histórico de Códigos ({historyList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('relacionados')}
            className={`border-b-2 py-3 px-3 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'relacionados'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Produtos Relacionados ({relatedList.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: DADOS GERAIS */}
          {activeTab === 'info' && (
            <form onSubmit={handleSaveDetails} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição do Produto *
                </label>
                <input
                  type="text"
                  required
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código Interno Atual
                  </label>
                  <input
                    type="text"
                    disabled
                    value={currentProduct.codigo_atual}
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 p-2.5 font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-400">Para trocar, utilize a aba Histórico.</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código do Fabricante / Referência
                  </label>
                  <input
                    type="text"
                    value={codigoFabrica}
                    onChange={e => setCodigoFabrica(e.target.value)}
                    placeholder="Ex: 504.02.1"
                    className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Códigos Alternativos / Equivalentes
                </label>
                <input
                  type="text"
                  value={codigosAlternativos}
                  onChange={e => setCodigosAlternativos(e.target.value)}
                  placeholder="Ex: 789000111222, REF-10B, COD-SECUNDARIO (separados por vírgula)"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Estes códigos também são reconhecidos na pesquisa e leitura por bipador.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código de Barras Atual (EAN)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      disabled
                      value={currentProduct.codigo_barras_atual || 'Não cadastrado'}
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-100 p-2.5 font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setNewCodeType('codigo_barras');
                        setShowReplaceCodeModal(true);
                      }}
                      className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 transition"
                    >
                      Trocar
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Estoque Atual
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={quantidade}
                        onChange={e => setQuantidade(parseInt(e.target.value) || 0)}
                        className="w-full rounded-lg border border-slate-300 p-2.5 font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-center"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Est. Mínimo
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={estoqueMinimo}
                        onChange={e => setEstoqueMinimo(parseInt(e.target.value) || 0)}
                        className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-center"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1 pt-1 justify-end">
                    <span className="text-[10px] text-slate-400 mr-1">Ajuste rápido:</span>
                    <button
                      type="button"
                      disabled={quantidade <= 0}
                      onClick={() => handleQuickStockChange(-1)}
                      className="rounded bg-rose-50 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50 dark:bg-rose-950/40 dark:text-rose-400"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickStockChange(1)}
                      className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickStockChange(5)}
                      className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400"
                    >
                      +5
                    </button>
                  </div>
                </div>
              </div>

              {/* VALORES E PREÇOS (CUSTO CONFIDENCIAL + PREÇOS DE VENDA) */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-black text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Valores Financeiros & Precificação
                  </span>
                </div>

                {/* CUSTO DE AQUISIÇÃO - SIGILOSO */}
                <div className="p-3.5 rounded-xl border-2 border-amber-300/80 bg-amber-50/70 dark:border-amber-700/60 dark:bg-amber-950/20">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <label className="font-black text-xs text-amber-900 dark:text-amber-300">
                        Custo de Aquisição (Compra - SIGILOSO)
                      </label>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                      Interno / Restrito
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-amber-800 dark:text-amber-300 text-sm">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={custoUnitario}
                      onChange={e => setCustoUnitario(e.target.value)}
                      placeholder="0,00"
                      className="w-full rounded-lg border-2 border-amber-300 bg-white pl-10 pr-3 py-2 font-mono font-black text-base text-amber-950 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
                    />
                  </div>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400/90 mt-1.5 leading-tight">
                    * Confidencial: exibido unicamente aqui no detalhe do produto. Não aparece na consulta geral nem na tela de bipagem.
                  </p>
                </div>

                {/* 3 PREÇOS DE VENDA (TABELA, SUGERIDO, MÍNIMO) */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                    Preço de Venda (R$)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-black tracking-wider text-blue-700 dark:text-blue-300">
                          TABELA
                        </span>
                        <Tag className="h-3 w-3 text-blue-500" />
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={precoTabela}
                        onChange={e => setPrecoTabela(e.target.value)}
                        placeholder="0,00"
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-mono font-black text-sm text-blue-900 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200 text-center"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-black tracking-wider text-emerald-700 dark:text-emerald-300">
                          SUGERIDO
                        </span>
                        <Tag className="h-3 w-3 text-emerald-500" />
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={precoSugerido}
                        onChange={e => setPrecoSugerido(e.target.value)}
                        placeholder="0,00"
                        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-1.5 font-mono font-black text-sm text-emerald-900 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200 text-center"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/50 dark:border-purple-900/40 dark:bg-purple-950/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-black tracking-wider text-purple-700 dark:text-purple-300">
                          MÍNIMO
                        </span>
                        <Tag className="h-3 w-3 text-purple-500" />
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={precoMinimo}
                        onChange={e => setPrecoMinimo(e.target.value)}
                        placeholder="0,00"
                        className="w-full rounded-lg border border-purple-200 bg-white px-3 py-1.5 font-mono font-black text-sm text-purple-900 dark:border-purple-800 dark:bg-slate-900 dark:text-purple-200 text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 shadow"
                >
                  <Save className="h-4 w-4" /> Salvar Alterações
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: LOCALIZAÇÃO FÍSICA (CORREDOR, BAIA, NÍVEL, LOCAÇÃO) */}
          {activeTab === 'location' && (
            <form onSubmit={handleSaveDetails} className="space-y-4 text-xs">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 block mb-2">
                  Pré-visualização do Endereçamento Físico
                </span>
                <LocationBadge
                  corredor={corredor}
                  baia={baia}
                  nivel={nivel}
                  locacao={locacao}
                  size="large"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Corredor
                  </label>
                  <input
                    type="text"
                    value={corredor}
                    onChange={e => setCorredor(e.target.value.toUpperCase())}
                    placeholder="Ex: 03 ou A"
                    className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-center font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Baia / Módulo
                  </label>
                  <input
                    type="text"
                    value={baia}
                    onChange={e => setBaia(e.target.value.toUpperCase())}
                    placeholder="Ex: B12"
                    className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-center font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nível / Prateleira
                  </label>
                  <input
                    type="text"
                    value={nivel}
                    onChange={e => setNivel(e.target.value.toUpperCase())}
                    placeholder="Ex: 04"
                    className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-center font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Locação Completa / Descritiva
                </label>
                <input
                  type="text"
                  value={locacao}
                  onChange={e => setLocacao(e.target.value)}
                  placeholder="Ex: 03-B12-04 ou Prateleira 4 Central"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Regra 4: A localização física existente NUNCA será perdida em atualizações de código.
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 shadow"
                >
                  <Save className="h-4 w-4" /> Salvar Localização Física
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: HISTÓRICO PERMANENTE DE CÓDIGOS */}
          {activeTab === 'history' && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    Registro Permanente de Rastreabilidade
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Regra 1: Códigos antigos nunca são apagados e continuam identificáveis na bipagem.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowReplaceCodeModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-500 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Cadastrar Novo Código</span>
                </button>
              </div>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                {historyList.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    Nenhum código registrado no histórico além do atual.
                  </div>
                ) : (
                  historyList.map(item => (
                    <div key={item.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                            {item.codigo}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              item.tipo === 'codigo_barras'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                : item.tipo === 'codigo_fabrica'
                                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {item.tipo.replace('_', ' ')}
                          </span>
                        </div>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            item.ativo
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {item.ativo ? 'ATIVO EM VIGOR' : 'HISTÓRICO ARQUIVADO'}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
                        <span>Motivo: {item.motivo || 'Cadastro inicial'}</span>
                        <span className="font-mono">
                          Início: {new Date(item.criado_em).toLocaleDateString('pt-BR')}
                          {item.desativado_em && ` • Fim: ${new Date(item.desativado_em).toLocaleDateString('pt-BR')}`}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PRODUTOS RELACIONADOS / GENÉRICOS */}
          {activeTab === 'relacionados' && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Peças Relacionadas, Similares e Genéricos</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Quando este produto for bipado ou consultado, o sistema exibirá automaticamente estas opções de peças compatíveis.
                  </p>
                </div>
              </div>

              {/* Form to link a related product */}
              <form onSubmit={handleAddRelated} className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 dark:border-indigo-950 dark:bg-indigo-950/20 space-y-3">
                <span className="font-bold text-indigo-950 dark:text-indigo-200 block">
                  Vincular Nova Peça Similar / Genérico
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Filtrar e Selecionar Produto
                    </label>
                    <input
                      type="text"
                      placeholder="Buscar por nome ou código..."
                      value={searchRelTerm}
                      onChange={e => setSearchRelTerm(e.target.value)}
                      className="w-full mb-1.5 rounded-lg border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <select
                      value={selectedRelProductId}
                      onChange={e => setSelectedRelProductId(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="">Selecione a mercadoria...</option>
                      {storageService
                        .getProducts()
                        .filter(p => p.id !== currentProduct.id)
                        .filter(p =>
                          !searchRelTerm ||
                          p.descricao.toLowerCase().includes(searchRelTerm.toLowerCase()) ||
                          p.codigo_atual.toLowerCase().includes(searchRelTerm.toLowerCase())
                        )
                        .slice(0, 30)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            [{p.codigo_atual}] {p.descricao} (Est: {p.quantidade})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Motivo / Tipo de Vínculo
                    </label>
                    <input
                      type="text"
                      value={relMotivo}
                      onChange={e => setRelMotivo(e.target.value)}
                      placeholder="Ex: Fabricante paralelo / Mesma furação"
                      className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="submit"
                        disabled={!selectedRelProductId && !searchRelTerm.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 disabled:opacity-50 shadow"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        <span>Vincular Peça</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {/* List of currently related products */}
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                {isLoadingRelated ? (
                  <div className="p-4 text-center text-slate-400">Carregando produtos relacionados...</div>
                ) : relatedList.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    Nenhum produto genérico ou similar vinculado a este item.
                  </div>
                ) : (
                  relatedList.map((rel: any) => {
                    const relId = rel.relacionado_id || rel.id;
                    const relDesc = rel.relacionado_descricao || rel.descricao || 'Produto';
                    const relCod = rel.relacionado_codigo || rel.codigo_atual || '';
                    const relQtd = rel.relacionado_quantidade ?? rel.quantidade ?? 0;
                    const relLoc = rel.relacionado_locacao || rel.locacao || 'Sem locação';

                    return (
                      <div key={relId} className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
                              {relCod}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {relDesc}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span>Estoque: <strong className={relQtd > 0 ? 'text-emerald-600' : 'text-rose-600'}>{relQtd} un.</strong></span>
                            <span>•</span>
                            <span>Loc: <strong className="text-slate-700 dark:text-slate-300">{relLoc}</strong></span>
                            {rel.motivo && (
                              <>
                                <span>•</span>
                                <span className="italic text-slate-400">{rel.motivo}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveRelated(relId)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 transition"
                          title="Remover vínculo"
                        >
                          <Unlink className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/90 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              <span>ID: {currentProduct.id}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-bold hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:text-white space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Excluir Produto com Segurança
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Tem certeza que deseja remover o produto <strong>[{currentProduct.codigo_atual}] {currentProduct.descricao}</strong>?
            </p>

            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-[11px] text-rose-800 dark:border-rose-950 dark:bg-rose-950/30 dark:text-rose-300">
              Esta ação removerá o produto, seu histórico de códigos e vínculos associados de forma segura tanto no armazenamento local quanto no banco de dados.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteProduct}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 font-bold text-white hover:bg-rose-500 shadow disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO OBRIGATÓRIA PARA SUBSTITUIÇÃO DE CÓDIGO (Regra 3) */}
      {showReplaceCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleExecuteReplaceCode}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:text-white"
          >
            <div className="flex items-center gap-2.5 text-amber-600 mb-3">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Substituir e Arquivar Código
              </h3>
            </div>

            <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 mb-4">
              <strong>Regra KIPSTOCK:</strong> O código antigo nunca será apagado. Ele permanecerá vinculado a este produto no histórico para que qualquer bipagem futura continue localizando este mesmo item.
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo de Código a Atualizar
                </label>
                <select
                  value={newCodeType}
                  onChange={e => setNewCodeType(e.target.value as CodeType)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="codigo_barras">Código de Barras (EAN)</option>
                  <option value="codigo_interno">Código Interno</option>
                  <option value="codigo_fabrica">Código de Fábrica</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Novo Código
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCodeValue}
                  onChange={e => setNewCodeValue(e.target.value)}
                  placeholder="Digite ou bipe o novo código"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo da Alteração
                </label>
                <input
                  type="text"
                  required
                  value={newCodeReason}
                  onChange={e => setNewCodeReason(e.target.value)}
                  placeholder="Ex: Fabricante trocou a embalagem / Novo lote"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowReplaceCodeModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow"
              >
                Confirmar Substituição
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
