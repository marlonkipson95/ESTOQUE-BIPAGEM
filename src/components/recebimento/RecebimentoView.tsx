import React, { useState, useRef, useEffect } from 'react';
import {
  PackageCheck,
  Barcode,
  Camera,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Plus,
  RotateCcw,
  Boxes,
  HelpCircle,
} from 'lucide-react';
import { Product, ProductCodeHistory, ScanResult } from '../../types';
import { storageService } from '../../services/storageService';
import { apiService } from '../../services/apiService';
import { beepService } from '../../services/beepService';
import { LocationBadge } from '../common/LocationBadge';

interface RecebimentoViewProps {
  onSelectProduct: (product: Product) => void;
  onOpenQuickScan: () => void;
  onOpenNewProductWithCode: (code: string) => void;
  externalScannedCode?: string;
  onClearExternalScannedCode?: () => void;
}

export const RecebimentoView: React.FC<RecebimentoViewProps> = ({
  onSelectProduct,
  onOpenQuickScan,
  onOpenNewProductWithCode,
  externalScannedCode,
  onClearExternalScannedCode,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [scannedCode, setScannedCode] = useState('');
  const [identifiedProduct, setIdentifiedProduct] = useState<Product | null>(null);
  const [newBarcodeDetected, setNewBarcodeDetected] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [receivedQty, setReceivedQty] = useState<number>(1);
  const [receivingSuccessMsg, setReceivingSuccessMsg] = useState<string | null>(null);
  const [showConfirmUpdateModal, setShowConfirmUpdateModal] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [identifiedProduct]);

  useEffect(() => {
    if (externalScannedCode) {
      handleProcessReceivingCode(externalScannedCode);
      onClearExternalScannedCode?.();
    }
  }, [externalScannedCode]);

  const handleProcessReceivingCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    setReceivingSuccessMsg(null);
    setScannedCode(code);

    const scanRes = storageService.scanCode(code);

    if (scanRes.product) {
      setIdentifiedProduct(scanRes.product);
      setNotFound(false);

      // Check if scanned code is a brand new barcode for this identified product
      const currentBarcode = scanRes.product.codigo_barras_atual;
      const isDifferentBarcode =
        Boolean(code) &&
        code !== currentBarcode &&
        code !== scanRes.product.codigo_atual &&
        !/^[A-Za-z]/.test(code); // If numeric barcode format

      if (isDifferentBarcode && scanRes.status !== 'found_current') {
        setNewBarcodeDetected(true);
        beepService.playWarning();
      } else {
        setNewBarcodeDetected(false);
        beepService.playSuccess();
      }
    } else {
      // Not found
      setIdentifiedProduct(null);
      setNewBarcodeDetected(false);
      setNotFound(true);
      beepService.playError();
    }

    setInputCode('');
  };

  const handleConfirmNewBarcode = () => {
    if (!identifiedProduct || !scannedCode) return;

    const res = storageService.updateProductCode(
      identifiedProduct.id,
      'codigo_barras',
      scannedCode,
      'Atualizado durante o recebimento de mercadorias'
    );

    // Sync in background with PostgreSQL
    apiService.updateProductCode(
      identifiedProduct.id,
      'codigo_barras',
      scannedCode,
      'Atualizado durante o recebimento de mercadorias'
    ).catch(err => {
      console.warn('[DB] Atualização remota falhou, preservada no storage local:', err.message);
    });

    if (res.success && res.product) {
      setIdentifiedProduct(res.product);
      setNewBarcodeDetected(false);
      setShowConfirmUpdateModal(false);
      beepService.playSuccess();
      setReceivingSuccessMsg('Código de barras atualizado com sucesso no cadastro!');
    }
  };

  const handleCancelNewBarcode = () => {
    setNewBarcodeDetected(false);
    setShowConfirmUpdateModal(false);
  };

  const handleConfirmStockReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifiedProduct) return;

    const res = storageService.receiveGoods(
      identifiedProduct.id,
      receivedQty,
      scannedCode,
      `Conferência de recebimento no armazém`
    );

    if (res.success && res.product) {
      setIdentifiedProduct(res.product);
      beepService.playSuccess();
      setReceivingSuccessMsg(`Entrada de ${receivedQty} unidade(s) confirmada com sucesso! Estoque atual: ${res.product.quantidade} un.`);
    }
  };

  const handleReset = () => {
    setIdentifiedProduct(null);
    setNewBarcodeDetected(false);
    setNotFound(false);
    setScannedCode('');
    setReceivingSuccessMsg(null);
    setReceivedQty(1);
    setInputCode('');
    inputRef.current?.focus();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 mb-2">
          <PackageCheck className="h-4 w-4" />
          <span>Módulo de Entrada e Conferência</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
          RECEBIMENTO DE MERCADORIAS
        </h1>
        <p className="mt-1 text-xs md:text-sm text-slate-500 dark:text-slate-400">
          Identifique o produto que está chegando, verifique a localização no galpão e detecte alterações de código.
        </p>

        {/* Big Code Receiver Input */}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (inputCode.trim()) handleProcessReceivingCode(inputCode);
          }}
          className="mt-6"
        >
          <div className="relative">
            <input
              ref={inputRef}
              data-scanner-input="true"
              type="text"
              value={inputCode}
              onChange={e => setInputCode(e.target.value)}
              placeholder="BIPAR MERCADORIA (LEITOR USB OU DIGITE)"
              className="w-full rounded-2xl border-4 border-emerald-600/30 bg-white px-6 py-5 text-center font-mono text-xl md:text-2xl font-black tracking-wider text-slate-900 placeholder-slate-400 transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800 dark:focus:border-emerald-500"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="submit"
              disabled={!inputCode.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              <PackageCheck className="h-4 w-4" />
              <span>CONFERIR MERCADORIA</span>
            </button>

            <button
              type="button"
              onClick={onOpenQuickScan}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition"
            >
              <Camera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>USAR CÂMERA</span>
            </button>

            {(identifiedProduct || notFound) && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 transition"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Limpar</span>
              </button>
            )}
          </div>

          {/* Quick test buttons for real factory receipts */}
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800 text-left">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Simular Bipagem de Fábrica (Foto MWM):
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleProcessReceivingCode('7895825126942')}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2.5 py-1 text-xs font-semibold border border-emerald-200 dark:border-emerald-800"
              >
                <span>🏷️ EAN MWM: 7895825126942</span>
              </button>
              <button
                type="button"
                onClick={() => handleProcessReceivingCode('922688540114')}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 px-2.5 py-1 text-xs font-semibold border border-indigo-200 dark:border-indigo-800"
              >
                <span>🏭 Cód. Fábrica MWM: 922688540114</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Success Notification */}
      {receivingSuccessMsg && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{receivingSuccessMsg}</span>
        </div>
      )}

      {/* 9. SITUAÇÃO DE CÓDIGO NOVO (WARNING BANNER) */}
      {newBarcodeDetected && identifiedProduct && (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-50/90 p-5 shadow-lg dark:bg-amber-950/40 dark:border-amber-500">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-black text-amber-950 dark:text-amber-200">
                ⚠ NOVO CÓDIGO DE BARRAS DETECTADO
              </h2>
              <p className="text-xs text-amber-900/90 dark:text-amber-300 mt-0.5">
                A mercadoria bipada corresponde a este produto cadastrado, porém com uma etiqueta de código de barras diferente da cadastrada.
              </p>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono rounded-xl bg-white/80 p-3 border border-amber-200 dark:bg-slate-900/80 dark:border-amber-800">
                <div>
                  <span className="text-slate-500 font-sans block text-[11px]">Código anterior:</span>
                  <strong className="text-slate-900 dark:text-white text-sm">
                    {identifiedProduct.codigo_barras_atual || 'Não cadastrado'}
                  </strong>
                </div>
                <div>
                  <span className="text-amber-800 dark:text-amber-400 font-sans block text-[11px] font-bold">
                    Novo código detectado:
                  </span>
                  <strong className="text-indigo-600 dark:text-indigo-400 text-sm font-bold">
                    {scannedCode}
                  </strong>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                  Deseja atualizar o código de barras deste produto?
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleConfirmNewBarcode}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm"
                  >
                    ATUALIZAR
                  </button>
                  <button
                    onClick={handleCancelNewBarcode}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    CANCELAR
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRODUTO IDENTIFICADO VIEW */}
      {identifiedProduct && (
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <PackageCheck className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                PRODUTO IDENTIFICADO
              </h2>
            </div>

            <span className="font-mono text-xs font-bold rounded bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              ID: {identifiedProduct.id}
            </span>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
              {identifiedProduct.descricao}
            </h3>

            {/* Specifications Grid */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <span className="text-slate-400 font-medium block">Código Interno</span>
                <strong className="font-mono text-sm text-slate-900 dark:text-white">
                  {identifiedProduct.codigo_atual}
                </strong>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <span className="text-slate-400 font-medium block">Código Fábrica</span>
                <strong className="font-mono text-sm text-slate-900 dark:text-white">
                  {identifiedProduct.codigo_fabrica || '—'}
                </strong>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <span className="text-slate-400 font-medium block">Código Barras Atual</span>
                <strong className="font-mono text-sm text-slate-900 dark:text-white">
                  {identifiedProduct.codigo_barras_atual || 'Não cadastrado'}
                </strong>
              </div>

              <div className="rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/40">
                <span className="text-indigo-800 dark:text-indigo-300 font-medium block">Quantidade Cadastrada</span>
                <strong className="font-mono text-lg text-indigo-700 dark:text-indigo-300">
                  {identifiedProduct.quantidade} un
                </strong>
              </div>
            </div>
          </div>

          {/* PROMINENT PHYSICAL LOCATION: THE OPERATOR'S DECISION GUIDE */}
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-indigo-500" />
              <span>Onde Guardar (Localização Física Cadastrada)</span>
            </div>
            <LocationBadge
              corredor={identifiedProduct.corredor}
              baia={identifiedProduct.baia}
              nivel={identifiedProduct.nivel}
              locacao={identifiedProduct.locacao}
              size="large"
            />
          </div>

          {/* Receive Stock Input */}
          <form onSubmit={handleConfirmStockReceipt} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-xs font-bold text-slate-900 dark:text-white block">
                  Confirmar Entrada Física no Estoque
                </label>
                <span className="text-xs text-slate-500">
                  Quantidade recebida na conferência deste volume:
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 6, 12].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReceivedQty(preset)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                        receivedQty === preset
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      +{preset}{preset === 12 ? ' (Emb. Master)' : ''}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  value={receivedQty}
                  onChange={e => setReceivedQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  <span>Dar Entrada (+{receivedQty})</span>
                </button>
              </div>
            </div>
          </form>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onSelectProduct(identifiedProduct)}
              className="flex-1 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              Abrir Ficha do Produto
            </button>
            <button
              onClick={handleReset}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Próxima Mercadoria
            </button>
          </div>
        </div>
      )}

      {/* NOT FOUND VIEW */}
      {notFound && (
        <div className="rounded-2xl border-2 border-rose-300 bg-white p-6 shadow-xl dark:border-rose-900/50 dark:bg-slate-900 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
            <HelpCircle className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-lg font-black text-slate-900 dark:text-white">
            Mercadoria não identificada no recebimento
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Nenhum produto cadastrado corresponde ao código <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{scannedCode}</span>.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={() => onOpenNewProductWithCode(scannedCode)}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-md"
            >
              Cadastrar Este Novo Produto
            </button>
            <button
              onClick={handleReset}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Nova Leitura
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
