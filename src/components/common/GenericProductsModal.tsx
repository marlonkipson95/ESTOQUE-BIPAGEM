import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  MapPin,
  Plus,
  Trash2,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Product } from '../../types';
import { apiService } from '../../services/apiService';
import { beepService } from '../../services/beepService';

interface GenericProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSelectProduct?: (product: Product) => void;
  onProductUpdated?: (updated: Product) => void;
}

export const GenericProductsModal: React.FC<GenericProductsModalProps> = ({
  isOpen,
  onClose,
  product,
  onSelectProduct,
  onProductUpdated,
}) => {
  const [relatedList, setRelatedList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadGenerics = async () => {
    if (!product?.id) return;
    setIsLoading(true);
    try {
      const res = await apiService.getRelatedProducts(product.id);
      if (res && Array.isArray(res.relacionados)) {
        setRelatedList(res.relacionados);
      } else {
        setRelatedList(product.produtos_relacionados || []);
      }
    } catch {
      setRelatedList(product.produtos_relacionados || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && product?.id) {
      loadGenerics();
      setNewCodeInput('');
      setFeedback(null);
    }
  }, [isOpen, product?.id]);

  if (!isOpen || !product) return null;

  const handleLinkGeneric = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = newCodeInput.trim();
    if (!cleanCode) return;

    setIsLinking(true);
    setFeedback(null);

    try {
      await apiService.addRelatedProduct(product.id, {
        codigo: cleanCode,
        motivo: 'Peça genérica / similar intercambiável',
      });

      beepService.playSuccess();
      setFeedback({ type: 'success', text: `Código genérico "${cleanCode}" vinculado com sucesso!` });
      setNewCodeInput('');
      await loadGenerics();

      if (onProductUpdated) {
        onProductUpdated({
          ...product,
          total_genericos: (product.total_genericos || 0) + 1,
        });
      }

      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      beepService.playError();
      setFeedback({ type: 'error', text: err.message || 'Não foi possível vincular o código.' });
    } finally {
      setIsLinking(false);
    }
  };

  const handleRemoveGeneric = async (relId: string, relName: string) => {
    if (!confirm(`Deseja remover o vínculo com "${relName}"?`)) return;

    try {
      await apiService.removeRelatedProduct(product.id, relId);
      beepService.playSuccess();
      setFeedback({ type: 'success', text: 'Vínculo removido.' });
      await loadGenerics();

      if (onProductUpdated) {
        onProductUpdated({
          ...product,
          total_genericos: Math.max(0, (product.total_genericos || 1) - 1),
        });
      }
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      beepService.playError();
      setFeedback({ type: 'error', text: err.message || 'Falha ao desvincular.' });
    }
  };

  const formatPriceNumber = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return '0,00';
    return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4 bg-slate-50/70 dark:bg-slate-900/90">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20 shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  Códigos Genéricos & Peças Compatíveis
                </h2>
                <span className="rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-2.5 py-0.5 text-xs font-black">
                  {relatedList.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Item: <strong className="text-slate-700 dark:text-slate-200">{product.codigo_fabrica || product.codigo_atual}</strong> — {product.descricao}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className={`px-5 py-2.5 text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-800 border-b border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">

          {/* Form discreto para vincular mais genéricos */}
          <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-3 sm:p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                Vincular Novo Código Genérico
              </span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                Vínculo recíproco automático
              </span>
            </div>

            <form onSubmit={handleLinkGeneric} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={newCodeInput}
                  onChange={e => setNewCodeInput(e.target.value.toUpperCase())}
                  placeholder="Digite o Código de Fábrica ou Código Interno da outra peça..."
                  disabled={isLinking}
                  className="w-full rounded-xl border border-indigo-200 bg-white pl-9 pr-3 py-2 text-xs font-mono font-bold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 dark:border-indigo-900 dark:bg-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={isLinking || !newCodeInput.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-500 disabled:opacity-50 transition shadow-sm shrink-0"
              >
                {isLinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span>Salvar Genérico</span>
              </button>
            </form>
          </div>

          {/* Lista de Genéricos Cadastrados */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-2" />
              <span className="text-xs font-medium">Carregando códigos genéricos...</span>
            </div>
          ) : relatedList.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 mb-3">
                <Layers className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                Nenhum código genérico vinculado
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Utilize o campo acima para adicionar o código de fábrica ou código interno de outros itens equivalentes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {relatedList.map((rel: any) => {
                const stockQty = Number(rel.quantidade) || 0;
                const locationTag = rel.locacao || (rel.corredor || rel.baia || rel.nivel ? `${rel.corredor || '—'}-${rel.baia || '—'}-${rel.nivel || '—'}` : 'SEM LOCALIZAÇÃO');

                return (
                  <div
                    key={rel.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/90 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-800 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      
                      {/* Dados Principais da Peça Genérica */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 font-mono text-sm font-black text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300">
                            {rel.codigo_fabrica || rel.codigo_atual}
                          </span>

                          {rel.codigo_atual && rel.codigo_atual !== rel.codigo_fabrica && (
                            <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                              (Cód. Int: {rel.codigo_atual})
                            </span>
                          )}

                          {stockQty > 0 ? (
                            <span className="rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-black uppercase">
                              {stockQty} un em estoque
                            </span>
                          ) : (
                            <span className="rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 text-[11px] font-black uppercase">
                              Sem estoque
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          {rel.descricao}
                        </h4>

                        {/* Localização Física */}
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span>Locação:</span>
                          <strong className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {locationTag}
                          </strong>
                        </div>

                        {/* Preço de Venda (R$) */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                            Preço de Venda (R$)
                          </span>
                          <div className="grid grid-cols-3 gap-2 text-center max-w-sm">
                            <div className="rounded-lg bg-slate-50 p-1.5 border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                              <span className="block text-[9px] uppercase font-black text-slate-500">Tabela</span>
                              <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                                {formatPriceNumber(rel.preco_tabela)}
                              </span>
                            </div>
                            <div className="rounded-lg bg-indigo-50/70 p-1.5 border border-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-800">
                              <span className="block text-[9px] uppercase font-black text-indigo-700 dark:text-indigo-300">Sugerido</span>
                              <span className="font-mono text-xs font-black text-indigo-800 dark:text-indigo-200">
                                {formatPriceNumber(rel.preco_sugerido)}
                              </span>
                            </div>
                            <div className="rounded-lg bg-emerald-50/70 p-1.5 border border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800">
                              <span className="block text-[9px] uppercase font-black text-emerald-800 dark:text-emerald-300">Mínimo</span>
                              <span className="font-mono text-xs font-black text-emerald-800 dark:text-emerald-200">
                                {formatPriceNumber(rel.preco_minimo)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Ações para a peça genérica */}
                      <div className="flex items-center sm:flex-col gap-2 shrink-0 self-end sm:self-start mt-2 sm:mt-0">
                        {onSelectProduct && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProduct(rel);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition shadow-sm"
                          >
                            <span>Ver Peça</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveGeneric(rel.id, rel.descricao || rel.codigo_fabrica)}
                          title="Remover vínculo genérico"
                          className="inline-flex items-center gap-1 rounded-xl p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 transition text-xs font-medium"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sm:hidden">Desvincular</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 bg-slate-50/50 dark:bg-slate-900/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Cadastrar em uma peça vincula automaticamente em todas as outras do mesmo grupo.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
