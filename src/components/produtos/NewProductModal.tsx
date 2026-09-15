import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MapPin,
  Barcode,
  Factory,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Product } from '../../types';
import { storageService } from '../../services/storageService';
import { apiService } from '../../services/apiService';
import { beepService } from '../../services/beepService';
import { parseScannedLabel } from '../../utils/barcodeParser';

interface NewProductModalProps {
  initialBarcode?: string;
  initialCode?: string;
  onClose: () => void;
  onProductCreated: (product: Product) => void;
}

export const NewProductModal: React.FC<NewProductModalProps> = ({
  initialBarcode = '',
  initialCode = '',
  onClose,
  onProductCreated,
}) => {
  const scannedInput = (initialCode || initialBarcode || '').trim();
  const parsed = parseScannedLabel(scannedInput);

  // Auto-filled values from intelligent scan parsing
  const [descricao, setDescricao] = useState(parsed.descricao_sugerida || (parsed.fabricante ? `PEÇA ${parsed.fabricante}` : ''));
  const [codigoFabrica, setCodigoFabrica] = useState(parsed.codigo_fabrica || '');
  const [codigoBarras, setCodigoBarras] = useState(parsed.codigo_barras || '');
  const [codigoAtual, setCodigoAtual] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [estoqueMinimo, setEstoqueMinimo] = useState(5);

  // Primary Focus: Locação Física (Corredor, Baia, Nível)
  const [corredor, setCorredor] = useState('');
  const [baia, setBaia] = useState('');
  const [nivel, setNivel] = useState('');

  const [showAdvancedCodes, setShowAdvancedCodes] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const corredorRef = useRef<HTMLInputElement | null>(null);

  // Automatically focus on Corredor immediately so operator just types location!
  useEffect(() => {
    setTimeout(() => {
      corredorRef.current?.focus();
    }, 150);
  }, []);

  const formattedLocacao = [corredor.trim(), baia.trim(), nivel.trim()]
    .filter(Boolean)
    .join('-');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalDescricao = descricao.trim() || (parsed.fabricante ? `PRODUTO ${parsed.fabricante} (${codigoFabrica || codigoBarras})` : 'MERCADORIA EM ESTOQUE');

    setIsSaving(true);

    const payload = {
      descricao: finalDescricao,
      codigo_fabrica: codigoFabrica.trim() || undefined,
      codigo_barras_atual: codigoBarras.trim() || undefined,
      codigo_atual: codigoAtual.trim() || undefined,
      quantidade: Number(quantidade) || 0,
      estoque_minimo: Number(estoqueMinimo) || 5,
      corredor: corredor.trim() || undefined,
      baia: baia.trim() || undefined,
      nivel: nivel.trim() || undefined,
      locacao: formattedLocacao || undefined,
    };

    try {
      // 1. Persist to Centralized Database (PostgreSQL Neon)
      let persistedProduct: Product | null = null;
      let isExisting = false;
      let apiMessage = '';
      try {
        const apiRes = await apiService.createProduct(payload);
        if (apiRes && apiRes.product) {
          persistedProduct = apiRes.product;
        }
        if (apiRes?.isExisting) {
          isExisting = true;
          apiMessage = apiRes.message || 'Produto já estava cadastrado.';
        }
      } catch (apiErr: any) {
        if (apiErr.message?.includes('já está cadastrado')) {
          setError(apiErr.message);
          beepService.playError();
          setIsSaving(false);
          return;
        }
        console.warn('[Cadastro] Sincronização offline em andamento:', apiErr.message);
      }

      // 2. Persist to shared client storage cache
      const localProd = storageService.addProduct({
        ...payload,
        id: persistedProduct?.id,
        codigo_atual: persistedProduct?.codigo_atual || payload.codigo_atual,
      });

      const finalProduct = persistedProduct || localProd;

      beepService.playSuccess();
      if (isExisting) {
        alert(`Atenção: ${apiMessage}`);
      }
      onProductCreated(finalProduct);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro inesperado ao cadastrar produto.');
      beepService.playError();
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 text-slate-900 dark:text-white my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                Cadastrar Mercadoria
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {parsed.fabricante ? (
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    Fabricante {parsed.fabricante} reconhecido automaticamente
                  </span>
                ) : (
                  'Códigos identificados! Preencha a locação para salvar.'
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:border-rose-900 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Automatically Populated Data Banner */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 dark:border-indigo-900/60 dark:bg-indigo-950/40">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-2">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Identificado no Bipe (Preenchido Automaticamente):</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="rounded-lg bg-white/90 dark:bg-slate-900/90 p-2 border border-indigo-100 dark:border-indigo-900">
                <span className="block text-[10px] text-slate-500 uppercase font-sans font-semibold">Cód. Barras (EAN)</span>
                <span className="font-bold text-slate-900 dark:text-white truncate block">
                  {codigoBarras || '—'}
                </span>
              </div>

              <div className="rounded-lg bg-white/90 dark:bg-slate-900/90 p-2 border border-indigo-100 dark:border-indigo-900">
                <span className="block text-[10px] text-slate-500 uppercase font-sans font-semibold">Cód. Fábrica</span>
                <span className="font-bold text-slate-900 dark:text-white truncate block">
                  {codigoFabrica || '—'}
                </span>
              </div>
            </div>

            <div className="mt-2.5">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Descrição da Mercadoria
              </label>
              <input
                type="text"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Ex: JUNTA, CABEÇOTE MOTOR (MWM)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* MAIN MISSION: LOCAÇÃO FÍSICA NO ARMAZÉM */}
          <div className="rounded-2xl border-2 border-amber-500/80 bg-amber-50/50 p-4 dark:border-amber-500/60 dark:bg-amber-950/20 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Defina a Locação Física da Mercadoria
                </span>
              </div>

              {formattedLocacao && (
                <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-md bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                  {formattedLocacao}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              {/* CORREDOR */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Corredor *
                </label>
                <input
                  ref={corredorRef}
                  type="text"
                  value={corredor}
                  onChange={e => setCorredor(e.target.value.toUpperCase())}
                  placeholder="Ex: 02"
                  required
                  className="w-full rounded-xl border-2 border-amber-400/80 bg-white px-3 py-3 text-center font-mono text-xl font-black text-slate-900 placeholder-slate-300 shadow-sm focus:border-amber-600 focus:outline-none dark:bg-slate-800 dark:text-white dark:border-amber-600"
                />
              </div>

              {/* BAIA */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Baia *
                </label>
                <input
                  type="text"
                  value={baia}
                  onChange={e => setBaia(e.target.value.toUpperCase())}
                  placeholder="Ex: B04"
                  required
                  className="w-full rounded-xl border-2 border-emerald-400/80 bg-white px-3 py-3 text-center font-mono text-xl font-black text-slate-900 placeholder-slate-300 shadow-sm focus:border-emerald-600 focus:outline-none dark:bg-slate-800 dark:text-white dark:border-emerald-600"
                />
              </div>

              {/* NÍVEL */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Nível *
                </label>
                <input
                  type="text"
                  value={nivel}
                  onChange={e => setNivel(e.target.value.toUpperCase())}
                  placeholder="Ex: 03"
                  required
                  className="w-full rounded-xl border-2 border-sky-400/80 bg-white px-3 py-3 text-center font-mono text-xl font-black text-slate-900 placeholder-slate-300 shadow-sm focus:border-sky-600 focus:outline-none dark:bg-slate-800 dark:text-white dark:border-sky-600"
                />
              </div>
            </div>

            <p className="mt-2 text-[11px] text-center text-slate-500 dark:text-slate-400">
              O operador só precisa digitar Corredor, Baia e Nível para organizar o estoque.
            </p>
          </div>

          {/* Collapsible Advanced Section for Codes / Quantities */}
          <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowAdvancedCodes(!showAdvancedCodes)}
              className="flex w-full items-center justify-between text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <span>Ajustar códigos ou quantidade inicial</span>
              {showAdvancedCodes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAdvancedCodes && (
              <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Código de Barras (EAN)
                    </label>
                    <input
                      type="text"
                      value={codigoBarras}
                      onChange={e => setCodigoBarras(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Código de Fábrica
                    </label>
                    <input
                      type="text"
                      value={codigoFabrica}
                      onChange={e => setCodigoFabrica(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Quantidade Inicial
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={quantidade}
                      onChange={e => setQuantidade(Number(e.target.value) || 0)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Código Interno (opcional)
                    </label>
                    <input
                      type="text"
                      value={codigoAtual}
                      onChange={e => setCodigoAtual(e.target.value)}
                      placeholder="Deixe em branco para automático"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isSaving ? 'SALVANDO NO BANCO...' : 'SALVAR E LOCALIZAR'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
