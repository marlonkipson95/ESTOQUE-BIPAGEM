import React, { useState, useRef, useEffect } from 'react';
import {
  Barcode,
  Camera,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  PlusCircle,
  MapPin,
  Sparkles,
  Edit3,
  Check,
  X,
  Boxes,
  ArrowRight,
  Layers,
  Plus,
  Save,
} from 'lucide-react';
import { Product, ScanResult } from '../../types';
import { storageService } from '../../services/storageService';
import { apiService } from '../../services/apiService';
import { beepService } from '../../services/beepService';
import { parseScannedLabel } from '../../utils/barcodeParser';
import { formatCurrency } from '../../utils/formatters';
import { GenericProductsModal } from '../common/GenericProductsModal';
import { AdaptivePrice } from '../common/AdaptivePrice';

interface BipagemViewProps {
  onSelectProduct: (product: Product) => void;
  onOpenNewProductWithCode: (code: string) => void;
  onOpenQuickScan: () => void;
  externalScannedCode?: string;
  onClearExternalScannedCode?: () => void;
}

export const BipagemView: React.FC<BipagemViewProps> = ({
  onSelectProduct,
  onOpenNewProductWithCode,
  onOpenQuickScan,
  externalScannedCode,
  onClearExternalScannedCode,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Quick Location Edit State (for existing products)
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [editCorredor, setEditCorredor] = useState('');
  const [editBaia, setEditBaia] = useState('');
  const [editNivel, setEditNivel] = useState('');
  const [locationSuccessMsg, setLocationSuccessMsg] = useState('');

  // Quick Inline Registration State (when product is not found)
  const [inlineCorredor, setInlineCorredor] = useState('');
  const [inlineBaia, setInlineBaia] = useState('');
  const [inlineNivel, setInlineNivel] = useState('');
  const [inlineDescricao, setInlineDescricao] = useState('');
  const [isRegisteringInline, setIsRegisteringInline] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Consecutive Scans / Repeat Scan Tracking (Regra do Usuário)
  const [consecutiveScanCount, setConsecutiveScanCount] = useState<number>(1);
  const [isSameProductFlash, setIsSameProductFlash] = useState<boolean>(false);

  // Generic Products Modal State
  const [isGenericModalOpen, setIsGenericModalOpen] = useState(false);

  // Quick Edit Product Data on Scan (Descrição / Dados)
  const [isEditDataModalOpen, setIsEditDataModalOpen] = useState(false);
  const [editDescricao, setEditDescricao] = useState('');
  const [editCodigoFabrica, setEditCodigoFabrica] = useState('');
  const [editCodigoBarras, setEditCodigoBarras] = useState('');
  const [editScannedSourceCode, setEditScannedSourceCode] = useState('');
  const [isSavingDescricao, setIsSavingDescricao] = useState(false);
  const [editDataSuccessMsg, setEditDataSuccessMsg] = useState('');

  const formatPriceOnlyNumber = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return '0,00';
    return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleOpenEditData = (initialDesc?: string) => {
    if (!scanResult?.product) return;
    const p = scanResult.product;
    const scanned = (scanResult.code || '').trim();
    setEditScannedSourceCode(scanned);

    // Identifica se o bipe é um código de barras numérico (7 a 14 dígitos) ou alfanumérico de fábrica
    const isBarcodeLike = /^\d{7,14}$/.test(scanned.replace(/[\s\.-]/g, ''));

    // Descrição: se não tiver ou for padrão, tenta sugerir do parser da etiqueta
    const parsed = parseScannedLabel(scanned);
    const suggestedDesc = parsed.descricao_sugerida || (parsed.fabricante ? `PEÇA ${parsed.fabricante}` : '');

    let descToUse = initialDesc !== undefined ? initialDesc : (p.descricao || '');
    if (!descToUse || descToUse.startsWith('PRODUTO ') || descToUse === 'MERCADORIA EM ESTOQUE') {
      descToUse = suggestedDesc || '';
    }
    setEditDescricao(descToUse);

    // Código de Barras: Se o bipe for código de barras numérico, já puxa do bipe!
    let barcodeToUse = p.codigo_barras_atual || '';
    if (isBarcodeLike && scanned && scanned !== p.codigo_barras_atual) {
      barcodeToUse = scanned;
    }
    setEditCodigoBarras(barcodeToUse);

    // Código de Fábrica: Se o bipe for alfanumérico / part number, já puxa do bipe!
    let factoryToUse = p.codigo_fabrica || '';
    if (!isBarcodeLike && scanned && scanned !== p.codigo_fabrica) {
      factoryToUse = scanned;
    }
    setEditCodigoFabrica(factoryToUse);

    setEditDataSuccessMsg('');
    setIsEditDataModalOpen(true);
  };

  const handleSaveProductData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanResult?.product?.id) return;
    const cleanDesc = editDescricao.trim();
    if (!cleanDesc) return;
    const cleanFab = editCodigoFabrica.trim();
    const cleanBar = editCodigoBarras.trim();

    setIsSavingDescricao(true);
    try {
      const updatedFields: any = {
        ...scanResult.product,
        descricao: cleanDesc,
        codigo_fabrica: cleanFab,
      };

      if (cleanBar) {
        updatedFields.codigo_barras_atual = cleanBar;
      }

      await apiService.updateProduct(scanResult.product.id, updatedFields);

      // Se o código de barras foi preenchido ou alterado, associa no histórico também
      if (cleanBar && cleanBar !== scanResult.product.codigo_barras_atual) {
        try {
          await apiService.updateProductCode(
            scanResult.product.id,
            'codigo_barras',
            cleanBar,
            'Código de barras atualizado a partir do bipe'
          );
        } catch {}
      }

      storageService.updateProduct({
        ...updatedFields,
        atualizado_em: new Date().toISOString(),
      });

      setScanResult({
        ...scanResult,
        product: {
          ...scanResult.product,
          ...updatedFields,
        },
      });

      beepService.playSuccess();
      setEditDataSuccessMsg('Dados atualizados com sucesso de acordo com a bipagem!');
      setTimeout(() => {
        setEditDataSuccessMsg('');
        setIsEditDataModalOpen(false);
      }, 1200);
    } catch (err: any) {
      beepService.playError();
      alert('Erro ao atualizar dados: ' + (err.message || 'Falha na conexão'));
    } finally {
      setIsSavingDescricao(false);
    }
  };

  const inputRef = useRef<HTMLInputElement | null>(null);
  const inlineCorredorRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus input on mount and whenever cleared for uninterrupted scanner operation
  useEffect(() => {
    inputRef.current?.focus();
  }, [scanResult]);

  // Handle incoming code from camera or global USB scanner
  useEffect(() => {
    if (externalScannedCode) {
      processBarcode(externalScannedCode);
      onClearExternalScannedCode?.();
    }
  }, [externalScannedCode]);

  const processBarcode = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    const cleanNorm = (str?: string) => (str ? str.replace(/[\s\.-]/g, '').toLowerCase() : '');
    const stripZeros = (str?: string) => (str ? str.replace(/^0+/, '') : '');
    const inputNorm = cleanNorm(code);
    const inputStripped = stripZeros(inputNorm);

    const matchesInput = (target?: string) => {
      if (!target) return false;
      const tNorm = cleanNorm(target);
      if (tNorm === inputNorm) return true;
      if (inputStripped.length >= 6 && stripZeros(tNorm) === inputStripped) return true;
      return false;
    };

    // =========================================================================
    // REGRA DE OURO MANDATÓRIA:
    // "quando bipar a mercadoria, se bipar duas vezes o mesmo codigo EAN, 
    //  o sistema nao pode criar um novo, ele tem apenas que entender que é a mesma mercadoria e manter os dados"
    // =========================================================================

    // CENÁRIO 1: A mercadoria já está aberta e exibida na tela
    if (scanResult?.product) {
      const p = scanResult.product;
      const isSameAsDisplayed =
        matchesInput(p.codigo_barras_atual) ||
        matchesInput(p.codigo_atual) ||
        matchesInput(p.codigo_fabrica) ||
        (Array.isArray(p.codigos_alternativos) && p.codigos_alternativos.some(c => matchesInput(c))) ||
        cleanNorm(scanResult.code) === inputNorm;

      if (isSameAsDisplayed) {
        // Entende imediatamente que é a mesma mercadoria e mantém rigorosamente todos os dados!
        beepService.playSuccess();
        setConsecutiveScanCount(prev => prev + 1);
        setIsSameProductFlash(true);
        setLocationSuccessMsg(
          `✓ Mesma mercadoria bipada novamente (${p.descricao}) — Dados e localização mantidos no estoque.`
        );
        setTimeout(() => setIsSameProductFlash(false), 2000);
        setTimeout(() => setLocationSuccessMsg(''), 5000);
        setInputCode('');
        inputRef.current?.focus();
        return;
      }
    }

    // CENÁRIO 2: Se estava na tela de produto não encontrado e o usuário bipou exatamente o mesmo código pela segunda vez
    if (scanResult?.status === 'not_found' && cleanNorm(scanResult.code) === inputNorm) {
      beepService.playWarning();
      setInlineError(`Código EAN (${code}) bipado novamente. Esta mercadoria ainda não está cadastrada. Preencha a locação abaixo para registrá-la.`);
      setInputCode('');
      return;
    }

    // Resetar contagem para nova mercadoria
    setConsecutiveScanCount(1);
    setIsLoading(true);
    setLocationSuccessMsg('');
    setInlineError(null);

    // Reset inline inputs
    setInlineCorredor('');
    setInlineBaia('');
    setInlineNivel('');

    try {
      // 1. Try server-side PostgreSQL scan first
      const serverResult = await apiService.scanCode(code);
      if (serverResult && serverResult.product) {
        setScanResult({
          code,
          status: serverResult.status,
          product: serverResult.product,
          matchedCodeHistory: serverResult.historicalRecord,
          message: serverResult.message,
          timestamp: new Date().toISOString(),
        });

        if (serverResult.status === 'found_current') {
          beepService.playSuccess();
        } else {
          beepService.playWarning();
        }
      } else {
        // Fallback to local storage query
        const localResult = storageService.scanCode(code);
        setScanResult(localResult);

        if (localResult.status === 'found_current') {
          beepService.playSuccess();
        } else if (localResult.status === 'not_found') {
          beepService.playError();
          // Pre-populate inline description if brand is recognized
          const parsed = parseScannedLabel(code);
          setInlineDescricao(parsed.descricao_sugerida || (parsed.fabricante ? `PEÇA ${parsed.fabricante}` : ''));
          setTimeout(() => inlineCorredorRef.current?.focus(), 150);
        } else {
          beepService.playWarning();
        }
      }
    } catch {
      // Offline fallback
      const localResult = storageService.scanCode(code);
      setScanResult(localResult);
      if (localResult.status === 'found_current') {
        beepService.playSuccess();
      } else if (localResult.status === 'not_found') {
        beepService.playError();
        const parsed = parseScannedLabel(code);
        setInlineDescricao(parsed.descricao_sugerida || (parsed.fabricante ? `PEÇA ${parsed.fabricante}` : ''));
        setTimeout(() => inlineCorredorRef.current?.focus(), 150);
      } else {
        beepService.playWarning();
      }
    } finally {
      setIsLoading(false);
      setInputCode('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim()) {
      processBarcode(inputCode);
    }
  };

  const handleClear = () => {
    setScanResult(null);
    setInputCode('');
    setIsEditingLocation(false);
    setLocationSuccessMsg('');
    setConsecutiveScanCount(1);
    setIsSameProductFlash(false);
    inputRef.current?.focus();
  };

  // Open location editor for existing product
  const handleOpenEditLocation = () => {
    if (!scanResult?.product) return;
    setEditCorredor(scanResult.product.corredor || '');
    setEditBaia(scanResult.product.baia || '');
    setEditNivel(scanResult.product.nivel || '');
    setIsEditingLocation(true);
  };

  // Save location change for existing product
  const handleSaveLocation = async () => {
    if (!scanResult?.product) return;

    const finalLoc = [editCorredor.trim(), editBaia.trim(), editNivel.trim()]
      .filter(Boolean)
      .join('-');

    const res = storageService.updateLocation(scanResult.product.id, {
      corredor: editCorredor.trim(),
      baia: editBaia.trim(),
      nivel: editNivel.trim(),
      locacao: finalLoc,
      motivo: 'Ajuste rápido de endereço na tela de bipagem',
    });

    if (res.success && res.product) {
      beepService.playSuccess();
      setScanResult({
        ...scanResult,
        product: res.product,
      });
      setIsEditingLocation(false);
      setLocationSuccessMsg('Localização física atualizada com sucesso!');
      setTimeout(() => setLocationSuccessMsg(''), 4000);
    }
  };

  // Quick inline registration for unknown product (Operator only enters Corredor, Baia, Nível!)
  const handleInlineRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanResult?.code) return;

    // 0. Validação prévia no storageService: se já existe, NUNCA duplica!
    const existing = storageService.findProductByAnyCode(scanResult.code);
    if (existing) {
      beepService.playSuccess();
      setScanResult({
        code: scanResult.code,
        status: 'found_current',
        product: existing,
        message: 'Mercadoria já cadastrada identificada com sucesso! Dados mantidos.',
        timestamp: new Date().toISOString(),
      });
      setLocationSuccessMsg(`Mercadoria já cadastrada! Localização existente (${existing.locacao || `${existing.corredor}-${existing.baia}-${existing.nivel}`}) mantida.`);
      setTimeout(() => setLocationSuccessMsg(''), 5000);
      setIsRegisteringInline(false);
      return;
    }

    const parsed = parseScannedLabel(scanResult.code);
    const finalCorredor = inlineCorredor.trim().toUpperCase();
    const finalBaia = inlineBaia.trim().toUpperCase();
    const finalNivel = inlineNivel.trim().toUpperCase();
    const finalLoc = [finalCorredor, finalBaia, finalNivel].filter(Boolean).join('-');

    if (!finalCorredor || !finalBaia || !finalNivel) {
      setInlineError('Por favor, informe Corredor, Baia e Nível para localizar a mercadoria.');
      beepService.playError();
      return;
    }

    setIsRegisteringInline(true);
    setInlineError(null);

    const desc = inlineDescricao.trim() || (parsed.fabricante ? `PEÇA ${parsed.fabricante}` : 'MERCADORIA EM ESTOQUE');

    const payload = {
      descricao: desc,
      codigo_barras_atual: parsed.codigo_barras || undefined,
      codigo_fabrica: parsed.codigo_fabrica || undefined,
      corredor: finalCorredor,
      baia: finalBaia,
      nivel: finalNivel,
      locacao: finalLoc,
      quantidade: 1,
      estoque_minimo: 5,
    };

    try {
      let created: Product | null = null;
      let isExisting = false;
      try {
        const apiRes = await apiService.createProduct(payload);
        if (apiRes && apiRes.product) {
          created = apiRes.product;
        }
        if (apiRes?.isExisting) {
          isExisting = true;
        }
      } catch (err: any) {
        // Se backend avisou que o produto já existe
        const found = storageService.findProductByAnyCode(scanResult.code);
        if (found) {
          setScanResult({
            code: scanResult.code,
            status: 'found_current',
            product: found,
            message: 'Mercadoria já cadastrada identificada. Dados mantidos.',
            timestamp: new Date().toISOString(),
          });
          setLocationSuccessMsg('Mercadoria já cadastrada! Localização e dados mantidos.');
          beepService.playSuccess();
          setIsRegisteringInline(false);
          return;
        }

        if (err.message?.includes('já está cadastrado') || err.message?.includes('já cadastrado')) {
          setInlineError(err.message);
          beepService.playWarning();
          setIsRegisteringInline(false);
          return;
        }
      }

      const localProd = storageService.addProduct({
        ...payload,
        id: created?.id,
        codigo_atual: created?.codigo_atual,
      });

      const finalProd = created || localProd;
      beepService.playSuccess();

      // Show newly created or recognized product immediately with its location!
      setScanResult({
        code: scanResult.code,
        status: 'found_current',
        product: finalProd,
        message: isExisting ? 'Mercadoria já cadastrada identificada. Dados mantidos.' : 'Produto localizado com sucesso no estoque!',
        timestamp: new Date().toISOString(),
      });
      setLocationSuccessMsg(isExisting ? 'Mercadoria já cadastrada! Localização e dados mantidos.' : 'Produto cadastrado com sucesso! Locação registrada.');
      setTimeout(() => setLocationSuccessMsg(''), 5000);
    } catch (err: any) {
      setInlineError(err.message || 'Erro ao cadastrar mercadoria');
      beepService.playError();
    } finally {
      setIsRegisteringInline(false);
    }
  };

  // Associate new barcode to existing product (when scanned factory code or associated)
  const handleAssociateBarcode = async () => {
    if (!scanResult?.product || !scanResult.code) return;
    setIsUpdating(true);

    try {
      await apiService.updateProductCode(
        scanResult.product.id,
        'codigo_barras',
        scanResult.code,
        'Código associado via tela de bipagem'
      );
    } catch {}

    const updateRes = storageService.updateProductCode(
      scanResult.product.id,
      'codigo_barras',
      scanResult.code,
      'Código associado via tela de bipagem'
    );

    setIsUpdating(false);
    if (updateRes.success && updateRes.product) {
      beepService.playSuccess();
      setScanResult({
        code: scanResult.code,
        status: 'found_current',
        product: updateRes.product,
        message: 'Código de barras associado com sucesso!',
        timestamp: new Date().toISOString(),
      });
      setLocationSuccessMsg('Código de barras associado a este produto com sucesso!');
      setTimeout(() => setLocationSuccessMsg(''), 4000);
    }
  };

  const handleQuickStockChange = async (delta: number) => {
    if (!scanResult?.product) return;
    setIsUpdating(true);
    const prod = scanResult.product;
    const newQty = Math.max(0, (prod.quantidade || 0) + delta);
    try {
      await apiService.updateStock(prod.id, {
        quantidade: newQty,
        motivo: `Ajuste rápido via bipagem (${delta > 0 ? '+' : ''}${delta})`,
      });
    } catch {}

    const res = await storageService.updateStock(
      prod.id,
      { quantidade: newQty },
      `Ajuste rápido via bipagem (${delta > 0 ? '+' : ''}${delta})`
    );

    setIsUpdating(false);
    if (res.success && res.product) {
      beepService.playSuccess();
      setScanResult({
        ...scanResult,
        product: {
          ...scanResult.product,
          quantidade: newQty,
        },
      });
      setLocationSuccessMsg(`Estoque atualizado: ${newQty} un`);
      setTimeout(() => setLocationSuccessMsg(''), 3000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      {/* Header & Big Scanner Input */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 mb-2">
          <Barcode className="h-4 w-4" />
          <span>Bipagem & Identificação de Locação</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
          BIPAR MERCADORIA
        </h1>
        <p className="mt-1 text-xs md:text-sm text-slate-500 dark:text-slate-400">
          Aponte o leitor de código de barras ou digite o código para ver a locação física no estoque.
        </p>

        {/* Big Input Form */}
        <form onSubmit={handleSubmit} className="mt-4 sm:mt-6">
          <div className="relative">
            <input
              ref={inputRef}
              data-scanner-input="true"
              type="text"
              value={inputCode}
              onChange={e => setInputCode(e.target.value)}
              placeholder="BIPE OU DIGITE O CÓDIGO (EAN / FÁBRICA)"
              disabled={isLoading}
              className="w-full rounded-2xl border-2 sm:border-4 border-indigo-600/30 bg-slate-50 px-4 py-3.5 sm:px-6 sm:py-5 text-center font-mono text-base sm:text-2xl font-black tracking-wider text-slate-900 placeholder-slate-400 transition focus:border-indigo-600 focus:bg-white focus:outline-none dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="mt-3.5 sm:mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3">
            <button
              type="submit"
              disabled={!inputCode.trim() || isLoading}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 sm:py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              <Barcode className="h-4 w-4" />
              <span>{isLoading ? 'LOCALIZANDO...' : 'CONSULTAR CÓDIGO'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenQuickScan}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 sm:py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Camera className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>CÂMERA</span>
              </button>

              {scanResult && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-3 sm:py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>LIMPAR</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Success Banner */}
      {locationSuccessMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-300 p-4 text-sm font-bold text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{locationSuccessMsg}</span>
        </div>
      )}

      {/* RESULT CARDS */}
      {scanResult && (
        <div className="space-y-4">
          {/* ============================================================ */}
          {/* CASE 1: PRODUTO ENCONTRADO - EXIBIR LOCALIZAÇÃO EM DESTAQUE */}
          {/* ============================================================ */}
          {scanResult.product && (
            <div className={`rounded-2xl border-2 bg-white p-6 shadow-xl dark:bg-slate-900 transition-all duration-300 ${
              isSameProductFlash
                ? 'border-blue-500 ring-4 ring-blue-400/40 scale-[1.005]'
                : 'border-emerald-500/80 dark:border-emerald-500/60'
            }`}>
              {/* RECONHECIMENTO DE MESMA MERCADORIA BIPADA REPETIDAMENTE */}
              {consecutiveScanCount > 1 && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-blue-50 border-2 border-blue-300 p-3.5 text-xs font-bold text-blue-900 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-100 animate-fadeIn">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-sm shrink-0">
                      {consecutiveScanCount}x
                    </div>
                    <div>
                      <span className="block font-black uppercase text-[11px] text-blue-700 dark:text-blue-300 tracking-wider">
                        Mesma Mercadoria Reconhecida ({consecutiveScanCount}º Bipe Consecutivo)
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 text-xs font-normal">
                        O sistema identificou que se trata da mesma peça. Nenhum cadastro duplicado foi criado e todos os dados foram mantidos.
                      </span>
                    </div>
                  </div>
                  <span className="rounded-lg bg-blue-200/80 px-2.5 py-1 text-[11px] font-mono font-bold text-blue-900 dark:bg-blue-900 dark:text-blue-200 shrink-0">
                    EAN: {scanResult.product.codigo_barras_atual || scanResult.code}
                  </span>
                </div>
              )}

              {/* Header Status */}
              <div className="flex items-center justify-between border-b border-emerald-100 pb-3 dark:border-emerald-900/40 gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                    <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        ITEM JÁ CADASTRADO NO ESTOQUE
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate mt-0.5">
                      PRODUTO LOCALIZADO
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenEditData()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 shadow-sm transition shrink-0"
                  title="Atualizar dados e descrição deste produto"
                >
                  <Edit3 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Atualizar dados</span>
                </button>
              </div>

              {/* CÓDIGO DE FÁBRICA EM DESTAQUE MÁXIMO PARA CONFERÊNCIA DA PEÇA */}
              <div className="mt-4 rounded-2xl border-2 border-indigo-500/50 bg-indigo-50/80 p-3.5 sm:p-4 dark:border-indigo-800/80 dark:bg-indigo-950/40 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">
                    CÓDIGO ORIGINAL / FÁBRICA (CONFERÊNCIA DA PEÇA):
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenEditData()}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100/60 dark:text-indigo-400 dark:hover:bg-indigo-950 transition"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>Atualizar dados</span>
                  </button>
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-wide break-all block">
                    {scanResult.product.codigo_fabrica || '—'}
                  </span>
                </div>

                {/* DESCRIÇÃO DA PEÇA OU BOTÃO DISCRETO PARA CADASTRAR DESCRIÇÃO */}
                {scanResult.product.descricao && 
                 scanResult.product.descricao.trim() && 
                 !scanResult.product.descricao.startsWith('PRODUTO ') && 
                 scanResult.product.descricao !== 'MERCADORIA EM ESTOQUE' ? (
                  <div className="mt-1.5 flex items-start justify-between gap-2 pt-1.5 border-t border-indigo-100 dark:border-indigo-900/40">
                    <p className="text-xs text-slate-700 dark:text-slate-200 font-medium leading-snug">
                      {scanResult.product.descricao}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenEditData(scanResult.product?.descricao)}
                      className="text-[11px] font-bold text-indigo-600 hover:underline dark:text-indigo-400 shrink-0 ml-2"
                    >
                      Editar
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 p-2.5 border border-amber-200 dark:border-amber-800/80">
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      Item sem descrição cadastrada
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenEditData('')}
                      className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-black text-white hover:bg-amber-500 shadow-sm transition shrink-0"
                    >
                      + Cadastrar Descrição
                    </button>
                  </div>
                )}
              </div>

              {/* BARRA DISCRETA DE CÓDIGOS GENÉRICOS (Requisito: indicador de quantidade + salvar mais) */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                <button
                  type="button"
                  onClick={() => setIsGenericModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-black text-indigo-700 hover:bg-indigo-50 dark:bg-slate-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-sm transition"
                >
                  <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    {(scanResult.product.total_genericos ?? (Array.isArray(scanResult.product.produtos_relacionados) ? scanResult.product.produtos_relacionados.length : 0))} cd. genérico{(scanResult.product.total_genericos ?? (Array.isArray(scanResult.product.produtos_relacionados) ? scanResult.product.produtos_relacionados.length : 0)) !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(clique para ver detalhes)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsGenericModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100/60 dark:text-indigo-300 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Vincular genérico</span>
                </button>
              </div>

              {/* DESTAQUE PRINCIPAL: LOCALIZAÇÃO FÍSICA NO ARMAZÉM */}
              <div className="mt-4 sm:mt-5 rounded-2xl border-2 border-indigo-600/40 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 sm:p-5 text-white shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5 gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-indigo-300 min-w-0">
                    <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400 animate-pulse shrink-0" />
                    <span className="text-xs sm:text-sm font-black tracking-widest uppercase text-amber-300 truncate">
                      LOCALIZAÇÃO FÍSICA NO ARMAZÉM
                    </span>
                  </div>

                  <button
                    onClick={handleOpenEditLocation}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/30 border border-indigo-400/40 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/50 transition shrink-0"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Alterar Locação</span>
                    <span className="sm:hidden">Alterar</span>
                  </button>
                </div>

                {/* CORREDOR | BAIA | NÍVEL EM DESTAQUE GIGANTE */}
                <div className="mt-3.5 grid grid-cols-3 gap-2 sm:gap-3 text-center">
                  {/* CORREDOR */}
                  <div className="rounded-xl bg-slate-800/90 p-2 sm:p-3 border border-slate-700 shadow-inner min-w-0">
                    <span className="block text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-300 mb-0.5 sm:mb-1">Corredor</span>
                    <span className="font-mono text-2xl sm:text-4xl font-black text-amber-400 truncate block">
                      {scanResult.product.corredor || '—'}
                    </span>
                  </div>

                  {/* BAIA */}
                  <div className="rounded-xl bg-slate-800/90 p-2 sm:p-3 border border-slate-700 shadow-inner min-w-0">
                    <span className="block text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-300 mb-0.5 sm:mb-1">Baia</span>
                    <span className="font-mono text-2xl sm:text-4xl font-black text-emerald-400 truncate block">
                      {scanResult.product.baia || '—'}
                    </span>
                  </div>

                  {/* NÍVEL */}
                  <div className="rounded-xl bg-slate-800/90 p-2 sm:p-3 border border-slate-700 shadow-inner min-w-0">
                    <span className="block text-[10px] sm:text-xs font-black uppercase tracking-wider text-sky-300 mb-0.5 sm:mb-1">Nível</span>
                    <span className="font-mono text-2xl sm:text-4xl font-black text-sky-400 truncate block">
                      {scanResult.product.nivel || '—'}
                    </span>
                  </div>
                </div>

                {/* Tag de Locação Completa */}
                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 border border-slate-700/60 text-xs">
                  <span className="font-semibold text-slate-400 uppercase tracking-wide">
                    Endereçamento:
                  </span>
                  <span className="font-mono text-base sm:text-xl font-black tracking-widest text-indigo-300">
                    {scanResult.product.locacao || `${scanResult.product.corredor || '0'}-${scanResult.product.baia || '0'}-${scanResult.product.nivel || '0'}`}
                  </span>
                </div>
              </div>

              {/* VALORES DE VENDA (TABELA, SUGERIDO, MÍNIMO) - TIPOGRAFIA ADAPTATIVA COM CASAS DECIMAIS GARANTIDAS */}
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-2">
                  Preço de Venda (R$)
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-100/90 p-2 sm:p-3 border-2 border-slate-300 dark:bg-slate-800 dark:border-slate-700 min-w-0 shadow-sm flex flex-col justify-center">
                    <span className="block text-[10px] sm:text-xs uppercase font-black tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      TABELA
                    </span>
                    <AdaptivePrice value={scanResult.product.preco_tabela} />
                  </div>
                  <div className="rounded-xl bg-indigo-50 p-2 sm:p-3 border-2 border-indigo-300 dark:bg-indigo-950/60 dark:border-indigo-700 min-w-0 shadow-sm flex flex-col justify-center">
                    <span className="block text-[10px] sm:text-xs uppercase font-black tracking-wider text-indigo-700 dark:text-indigo-300 mb-1">
                      SUGERIDO
                    </span>
                    <AdaptivePrice value={scanResult.product.preco_sugerido} colorClass="text-indigo-800 dark:text-indigo-200" />
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2 sm:p-3 border-2 border-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-700 min-w-0 shadow-sm flex flex-col justify-center">
                    <span className="block text-[10px] sm:text-xs uppercase font-black tracking-wider text-emerald-800 dark:text-emerald-300 mb-1">
                      MÍNIMO
                    </span>
                    <AdaptivePrice value={scanResult.product.preco_minimo} colorClass="text-emerald-800 dark:text-emerald-300" />
                  </div>
                </div>
              </div>

              {/* Informações Complementares dos Códigos e Estoque */}
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="block text-slate-400 font-medium">Cód. Barras (EAN)</span>
                  <strong className="font-mono text-sm text-slate-900 dark:text-white truncate block mt-0.5">
                    {scanResult.product.codigo_barras_atual || '—'}
                  </strong>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="block text-slate-400 font-medium">Cód. Fábrica</span>
                  <strong className="font-mono text-sm text-slate-900 dark:text-white truncate block mt-0.5">
                    {scanResult.product.codigo_fabrica || '—'}
                  </strong>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="block text-slate-400 font-medium">Código Interno</span>
                  <strong className="font-mono text-sm text-slate-900 dark:text-white truncate block mt-0.5">
                    {scanResult.product.codigo_atual}
                  </strong>
                </div>

                <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40">
                  <span className="block text-emerald-800 dark:text-emerald-400 font-medium">Estoque Atual</span>
                  <strong className="font-mono text-xl text-emerald-700 dark:text-emerald-300 block">
                    {scanResult.product.quantidade} un
                  </strong>
                </div>
              </div>

              {/* CÓDIGOS ALTERNATIVOS */}
              {Array.isArray(scanResult.product.codigos_alternativos) && scanResult.product.codigos_alternativos.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-bold text-slate-500">Códigos Alternativos:</span>
                  {scanResult.product.codigos_alternativos.map((altCode, i) => (
                    <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                      {altCode}
                    </span>
                  ))}
                </div>
              )}

              {/* PRODUTOS RELACIONADOS / GENÉRICOS (Requisito #11) */}
              {Array.isArray(scanResult.product.produtos_relacionados) && scanResult.product.produtos_relacionados.length > 0 && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                        {scanResult.product.produtos_relacionados.length}
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-blue-900 dark:text-blue-200">
                        Peças Similares / Genéricos Compatíveis
                      </span>
                    </div>
                    {scanResult.product.quantidade === 0 && (
                      <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase text-white animate-pulse">
                        Principal sem estoque!
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 mt-2">
                    {scanResult.product.produtos_relacionados.map((rel: any, idx: number) => {
                      const relStock = Number(rel.quantidade) || 0;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-white p-3 border border-blue-100 dark:bg-slate-800 dark:border-blue-900 shadow-sm"
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                {rel.codigo_atual}
                              </span>
                              <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                                {rel.descricao}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>Locação: <strong className="text-slate-700 dark:text-slate-300">{rel.locacao || `${rel.corredor || '—'}-${rel.baia || '—'}-${rel.nivel || '—'}`}</strong></span>
                              {rel.motivo_relacao && <span className="italic">({rel.motivo_relacao})</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`font-mono text-xs font-black px-2 py-1 rounded-md ${
                              relStock > 0
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            }`}>
                              {relStock} un
                            </span>
                            <button
                              type="button"
                              onClick={() => onSelectProduct(rel)}
                              className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-500 transition"
                            >
                              Ver
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Optional associate barcode button if scanned was a factory code or historical */}
              {scanResult.code &&
                scanResult.product.codigo_barras_atual !== scanResult.code &&
                /^\d{8,14}$/.test(scanResult.code) && (
                  <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 flex items-center justify-between dark:bg-indigo-950/40 dark:border-indigo-900">
                    <div className="text-xs text-indigo-900 dark:text-indigo-200">
                      <span className="font-bold block">Novo código de barras bipado: {scanResult.code}</span>
                      <span>Deseja definir este código como o código de barras oficial deste produto?</span>
                    </div>
                    <button
                      onClick={handleAssociateBarcode}
                      disabled={isUpdating}
                      className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow transition"
                    >
                      {isUpdating ? 'Atualizando...' : 'Definir como Código Oficial'}
                    </button>
                  </div>
                )}

              {/* Botões de Ação */}
              <div className="mt-6 flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                <button
                  onClick={() => onSelectProduct(scanResult.product!)}
                  className="flex-1 rounded-xl bg-slate-900 py-3.5 sm:py-3 text-center text-sm font-bold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-md transition"
                >
                  VER FICHA COMPLETA
                </button>
                <button
                  onClick={handleClear}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3.5 sm:py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition"
                >
                  BIPAR PRÓXIMO
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* CASE 2: PRODUTO NÃO ENCONTRADO - CADASTRO IMEDIATO DA LOCAÇÃO */}
          {/* ============================================================ */}
          {scanResult.status === 'not_found' && (
            <div className="rounded-2xl border-2 border-amber-400 bg-white p-6 shadow-xl dark:bg-slate-900 dark:border-amber-500/80">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                      CÓDIGO NÃO LOCALIZADO NO ESTOQUE
                    </span>
                    <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                      NOVA MERCADORIA: DEFINIR LOCAÇÃO
                    </h2>
                  </div>
                </div>
              </div>

              {/* Detected Codes Banner */}
              {(() => {
                const parsed = parseScannedLabel(scanResult.code);
                return (
                  <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 dark:border-indigo-900 dark:bg-indigo-950/40">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-2">
                      <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Códigos Detectados pelo Bipe:</span>
                      {parsed.fabricante && (
                        <span className="ml-auto rounded bg-indigo-600 text-white px-2 py-0.5 text-[10px] font-black">
                          Fabricante: {parsed.fabricante}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="rounded-lg bg-white p-2 border border-indigo-100 dark:bg-slate-800 dark:border-indigo-900">
                        <span className="block text-[10px] text-slate-500 uppercase font-sans font-semibold">Cód. Barras (EAN)</span>
                        <span className="font-bold text-slate-900 dark:text-white truncate block">
                          {parsed.codigo_barras || '—'}
                        </span>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-indigo-100 dark:bg-slate-800 dark:border-indigo-900">
                        <span className="block text-[10px] text-slate-500 uppercase font-sans font-semibold">Cód. Fábrica</span>
                        <span className="font-bold text-slate-900 dark:text-white truncate block">
                          {parsed.codigo_fabrica || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {inlineError && (
                <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:border-rose-900 dark:text-rose-300">
                  {inlineError}
                </div>
              )}

              {/* INLINE REGISTRATION FORM: OPERATOR ONLY FILLS LOCATION! */}
              <form onSubmit={handleInlineRegister} className="mt-5 space-y-4">
                <div className="rounded-2xl border-2 border-amber-500 bg-amber-50/60 p-4 dark:bg-amber-950/20 dark:border-amber-600">
                  <label className="block text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-2">
                    Informe a Locação Física (Corredor, Baia, Nível) *
                  </label>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <span className="block text-[11px] font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                        Corredor *
                      </span>
                      <input
                        ref={inlineCorredorRef}
                        type="text"
                        value={inlineCorredor}
                        onChange={e => setInlineCorredor(e.target.value.toUpperCase())}
                        placeholder="Ex: 02"
                        required
                        className="w-full rounded-xl border-2 border-amber-400 bg-white px-2 py-2.5 text-center font-mono text-lg font-black text-slate-900 placeholder-slate-300 focus:border-amber-600 focus:outline-none dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div>
                      <span className="block text-[11px] font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                        Baia *
                      </span>
                      <input
                        type="text"
                        value={inlineBaia}
                        onChange={e => setInlineBaia(e.target.value.toUpperCase())}
                        placeholder="Ex: B04"
                        required
                        className="w-full rounded-xl border-2 border-emerald-400 bg-white px-2 py-2.5 text-center font-mono text-lg font-black text-slate-900 placeholder-slate-300 focus:border-emerald-600 focus:outline-none dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div>
                      <span className="block text-[11px] font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                        Nível *
                      </span>
                      <input
                        type="text"
                        value={inlineNivel}
                        onChange={e => setInlineNivel(e.target.value.toUpperCase())}
                        placeholder="Ex: 03"
                        required
                        className="w-full rounded-xl border-2 border-sky-400 bg-white px-2 py-2.5 text-center font-mono text-lg font-black text-slate-900 placeholder-slate-300 focus:border-sky-600 focus:outline-none dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Descrição da Mercadoria (opcional)
                  </label>
                  <input
                    type="text"
                    value={inlineDescricao}
                    onChange={e => setInlineDescricao(e.target.value)}
                    placeholder="Ex: JUNTA, CABEÇOTE MOTOR (MWM)"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isRegisteringInline}
                    className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg hover:bg-indigo-500 disabled:opacity-50 transition"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isRegisteringInline ? 'SALVANDO NO BANCO...' : 'SALVAR PRODUTO NA LOCAÇÃO'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenNewProductWithCode(scanResult.code)}
                    className="w-full sm:w-auto rounded-xl border border-slate-300 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                  >
                    Cadastro Completo...
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* QUICK LOCATION EDIT MODAL (FOR EXISTING PRODUCT) */}
      {isEditingLocation && scanResult?.product && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <MapPin className="h-5 w-5" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Alterar Localização Física
                </h3>
              </div>
              <button
                onClick={() => setIsEditingLocation(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Atualize a prateleira da mercadoria no estoque:
            </p>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Corredor
                  </label>
                  <input
                    type="text"
                    value={editCorredor}
                    onChange={e => setEditCorredor(e.target.value.toUpperCase())}
                    placeholder="Ex: 02"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Baia
                  </label>
                  <input
                    type="text"
                    value={editBaia}
                    onChange={e => setEditBaia(e.target.value.toUpperCase())}
                    placeholder="Ex: B04"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Nível
                  </label>
                  <input
                    type="text"
                    value={editNivel}
                    onChange={e => setEditNivel(e.target.value.toUpperCase())}
                    placeholder="Ex: 03"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditingLocation(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 transition text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveLocation}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 shadow transition text-center"
                >
                  Confirmar Nova Locação
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ATUALIZAR DADOS / CADASTRAR DESCRIÇÃO NA BIPAGEM */}
      {isEditDataModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-indigo-600" />
                <span>Atualizar Descrição e Dados da Peça</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditDataModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProductData} className="space-y-4">
              {/* Identificação de Origem da Bipagem */}
              <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/50 p-2.5 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="leading-tight">
                  Código da bipagem atual: <strong className="font-mono text-indigo-700 dark:text-indigo-300 font-black">{editScannedSourceCode || scanResult?.code}</strong> (campos pré-carregados automaticamente abaixo)
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Código de Barras (EAN):
                  </label>
                  {(editScannedSourceCode || scanResult?.code) && editCodigoBarras !== (editScannedSourceCode || scanResult?.code) && (
                    <button
                      type="button"
                      onClick={() => setEditCodigoBarras(editScannedSourceCode || scanResult?.code || '')}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 underline cursor-pointer"
                    >
                      ⚡ Usar código do bipe ({editScannedSourceCode || scanResult?.code})
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={editCodigoBarras}
                  onChange={e => setEditCodigoBarras(e.target.value)}
                  placeholder="Ex: 7891234567890"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 font-mono text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Código de Fábrica / Part Number:
                  </label>
                  {(editScannedSourceCode || scanResult?.code) && editCodigoFabrica !== (editScannedSourceCode || scanResult?.code) && (
                    <button
                      type="button"
                      onClick={() => setEditCodigoFabrica(editScannedSourceCode || scanResult?.code || '')}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 underline cursor-pointer"
                    >
                      ⚡ Usar código do bipe ({editScannedSourceCode || scanResult?.code})
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={editCodigoFabrica}
                  onChange={e => setEditCodigoFabrica(e.target.value)}
                  placeholder="Ex: 0445120007"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição do Produto <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  autoFocus
                  value={editDescricao}
                  onChange={e => setEditDescricao(e.target.value)}
                  placeholder="Informe a descrição detalhada da peça..."
                  required
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {editDataSuccessMsg && (
                <div className="rounded-xl bg-emerald-50 text-emerald-800 p-2.5 text-xs font-bold flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{editDataSuccessMsg}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditDataModalOpen(false)}
                  className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingDescricao || !editDescricao.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-black text-white hover:bg-indigo-500 disabled:opacity-50 shadow"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSavingDescricao ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CÓDIGOS GENÉRICOS */}
      {isGenericModalOpen && scanResult?.product && (
        <GenericProductsModal
          isOpen={isGenericModalOpen}
          onClose={() => setIsGenericModalOpen(false)}
          product={scanResult.product}
          onSelectProduct={onSelectProduct}
          onProductUpdated={(updated) => {
            setScanResult({
              ...scanResult,
              product: {
                ...scanResult.product,
                ...updated,
                total_genericos: updated.total_genericos,
              },
            });
          }}
        />
      )}
    </div>
  );
};
