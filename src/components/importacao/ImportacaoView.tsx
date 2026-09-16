import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Settings2,
  Table,
  Shield,
  Layers,
  ArrowRightLeft,
  Check,
  Filter,
  RefreshCw,
  Boxes,
} from 'lucide-react';
import { Product, ImportProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { apiService } from '../../services/apiService';
import { beepService } from '../../services/beepService';

interface ImportacaoViewProps {
  onImportCompleted: () => void;
}

export const ImportacaoView: React.FC<ImportacaoViewProps> = ({ onImportCompleted }) => {
  const [csvText, setCsvText] = useState('');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState<'upload' | 'mapping' | 'comparacao' | 'success'>('upload');

  // Mapping state
  const [fieldMapping, setFieldMapping] = useState({
    descricao: '',
    codigo_atual: '',
    codigo_fabrica: '',
    codigo_barras_atual: '',
    quantidade: '',
    corredor: '',
    baia: '',
    nivel: '',
    locacao: '',
    genericos: '',
  });

  // Protection options (Business rules)
  const [preserveExistingLocation, setPreserveExistingLocation] = useState(true);
  const [archiveOldBarcodesInHistory, setArchiveOldBarcodesInHistory] = useState(true);

  // Comparison State (Requisito #12)
  const [comparisonItems, setComparisonItems] = useState<any[]>([]);
  const [comparisonSummary, setComparisonSummary] = useState<{
    total: number;
    novos: number;
    semAlteracao: number;
    comAlteracao: number;
  } | null>(null);
  const [filterComparisonStatus, setFilterComparisonStatus] = useState<
    'todos' | 'novo' | 'com_alteracao' | 'sem_alteracao'
  >('todos');
  const [isComparing, setIsComparing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const [importSummary, setImportSummary] = useState<{
    total: number;
    newCount: number;
    updatedCount: number;
  } | null>(null);

  // File parsing (supports CSV, TSV)
  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = e => {
      const content = e.target?.result as string;
      if (!content) return;
      setCsvText(content);
      parseDelimitedContent(content);
    };

    reader.readAsText(file);
  };

  const parseDelimitedContent = (raw: string) => {
    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return;

    // Detect delimiter: comma, semicolon or tab
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes(';')) delimiter = ';';
    else if (firstLine.includes('\t')) delimiter = '\t';

    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    setParsedHeaders(headers);

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < Math.min(lines.length, 500); i++) {
      const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = parts[idx] || '';
      });
      rows.push(rowObj);
    }
    setParsedRows(rows);

    // Auto-guess mapping based on common names
    const autoMap: typeof fieldMapping = { ...fieldMapping };
    headers.forEach(header => {
      const lower = header.toLowerCase();
      if (lower.includes('desc') || lower.includes('produto') || lower.includes('nome')) autoMap.descricao = header;
      else if (lower.includes('barras') || lower.includes('ean') || lower.includes('gtin')) autoMap.codigo_barras_atual = header;
      else if (lower.includes('fabrica') || lower.includes('ref') || lower.includes('modelo')) autoMap.codigo_fabrica = header;
      else if (lower.includes('interno') || lower.includes('codigo') || lower.includes('cod')) {
        if (!autoMap.codigo_atual) autoMap.codigo_atual = header;
      } else if (lower.includes('qtd') || lower.includes('quantidade') || lower.includes('estoque')) autoMap.quantidade = header;
      else if (lower.includes('corredor')) autoMap.corredor = header;
      else if (lower.includes('baia') || lower.includes('modulo')) autoMap.baia = header;
      else if (lower.includes('nivel') || lower.includes('prateleira')) autoMap.nivel = header;
      else if (lower.includes('locacao') || lower.includes('endereco') || lower.includes('posicao')) autoMap.locacao = header;
      else if (lower.includes('gener') || lower.includes('similar') || lower.includes('compat')) autoMap.genericos = header;
    });

    setFieldMapping(autoMap);
    setStep('mapping');
  };

  // Run comparative analysis against database (Requisito #12)
  const handleStartComparison = async () => {
    if (!fieldMapping.descricao) {
      alert('Selecione pelo menos a coluna de Descrição do produto.');
      return;
    }

    setIsComparing(true);

    const items = parsedRows
      .map(row => ({
        descricao: row[fieldMapping.descricao]?.trim() || '',
        codigo_atual: fieldMapping.codigo_atual ? row[fieldMapping.codigo_atual]?.trim() : '',
        codigo_fabrica: fieldMapping.codigo_fabrica ? row[fieldMapping.codigo_fabrica]?.trim() : '',
        codigo_barras_atual: fieldMapping.codigo_barras_atual ? row[fieldMapping.codigo_barras_atual]?.trim() : '',
        quantidade: fieldMapping.quantidade ? parseInt(row[fieldMapping.quantidade]) || 0 : 0,
        corredor: fieldMapping.corredor ? row[fieldMapping.corredor]?.trim() : '',
        baia: fieldMapping.baia ? row[fieldMapping.baia]?.trim() : '',
        nivel: fieldMapping.nivel ? row[fieldMapping.nivel]?.trim() : '',
        locacao: fieldMapping.locacao ? row[fieldMapping.locacao]?.trim() : '',
        genericos: fieldMapping.genericos ? row[fieldMapping.genericos]?.trim() : '',
      }))
      .filter(i => Boolean(i.descricao));

    try {
      // Call backend comparison endpoint
      const res = await apiService.compareImport(items);
      setComparisonItems(res.items);
      setComparisonSummary(res.summary);
      setStep('comparacao');
      beepService.playSuccess();
    } catch {
      // Offline fallback: perform local comparison
      const existingProducts = storageService.getProducts();
      let novos = 0;
      let semAlteracao = 0;
      let comAlteracao = 0;

      const compItems = items.map(item => {
        // Priority: 1. codigo_atual -> 2. codigo_barras_atual -> 3. codigo_fabrica
        const existing =
          (item.codigo_atual ? existingProducts.find(p => p.codigo_atual.toLowerCase() === item.codigo_atual.toLowerCase()) : null) ||
          (item.codigo_barras_atual ? existingProducts.find(p => p.codigo_barras_atual === item.codigo_barras_atual) : null) ||
          (item.codigo_fabrica ? existingProducts.find(p => p.codigo_fabrica && p.codigo_fabrica.toLowerCase() === item.codigo_fabrica.toLowerCase()) : null);

        if (!existing) {
          novos++;
          return { item, status: 'novo' as const };
        }

        const diffs: Record<string, { antiga: any; nova: any }> = {};
        if (item.descricao && item.descricao !== existing.descricao) {
          diffs.descricao = { antiga: existing.descricao, nova: item.descricao };
        }
        if (item.quantidade !== undefined && item.quantidade !== existing.quantidade) {
          diffs.quantidade = { antiga: existing.quantidade, nova: item.quantidade };
        }
        if (item.codigo_barras_atual && item.codigo_barras_atual !== existing.codigo_barras_atual) {
          diffs.codigo_barras = { antiga: existing.codigo_barras_atual || '(nenhum)', nova: item.codigo_barras_atual };
        }
        if (item.codigo_fabrica && item.codigo_fabrica !== existing.codigo_fabrica) {
          diffs.codigo_fabrica = { antiga: existing.codigo_fabrica || '(nenhum)', nova: item.codigo_fabrica };
        }

        if (Object.keys(diffs).length > 0) {
          comAlteracao++;
          return { item, status: 'com_alteracao' as const, existing, differences: diffs };
        } else {
          semAlteracao++;
          return { item, status: 'sem_alteracao' as const, existing };
        }
      });

      setComparisonItems(compItems);
      setComparisonSummary({ total: items.length, novos, semAlteracao, comAlteracao });
      setStep('comparacao');
      beepService.playSuccess();
    } finally {
      setIsComparing(false);
    }
  };

  // Execute import based on user selection mode (Requisito #12)
  const handleExecuteImport = async (mode: 'all' | 'only_new' | 'only_changed') => {
    setIsExecuting(true);

    let itemsToProcess = comparisonItems;
    if (mode === 'only_new') {
      itemsToProcess = comparisonItems.filter(c => c.status === 'novo');
    } else if (mode === 'only_changed') {
      itemsToProcess = comparisonItems.filter(c => c.status === 'com_alteracao');
    } else {
      // 'all': process both new and changed
      itemsToProcess = comparisonItems.filter(c => c.status === 'novo' || c.status === 'com_alteracao');
    }

    let newCount = 0;
    let updatedCount = 0;
    const batchPayload: any[] = [];

    itemsToProcess.forEach(comp => {
      const item = comp.item;
      const existing = comp.existing;

      if (comp.status === 'novo' || !existing) {
        newCount++;
        storageService.addProduct({
          descricao: item.descricao,
          codigo_atual: item.codigo_atual || undefined,
          codigo_fabrica: item.codigo_fabrica || undefined,
          codigo_barras_atual: item.codigo_barras_atual || undefined,
          quantidade: item.quantidade || 0,
          corredor: item.corredor || undefined,
          baia: item.baia || undefined,
          nivel: item.nivel || undefined,
          locacao: item.locacao || undefined,
        });
        batchPayload.push(item);
      } else if (comp.status === 'com_alteracao' && existing) {
        updatedCount++;

        // If new barcode detected and option enabled
        if (item.codigo_barras_atual && item.codigo_barras_atual !== existing.codigo_barras_atual && archiveOldBarcodesInHistory) {
          storageService.updateProductCode(
            existing.id,
            'codigo_barras',
            item.codigo_barras_atual,
            `Importado da planilha ${fileName || 'externa'}`
          );
        }

        // Location update rule (Regra 4: nunca apagar localização existente)
        const finalCorredor = preserveExistingLocation ? existing.corredor || item.corredor : item.corredor || existing.corredor;
        const finalBaia = preserveExistingLocation ? existing.baia || item.baia : item.baia || existing.baia;
        const finalNivel = preserveExistingLocation ? existing.nivel || item.nivel : item.nivel || existing.nivel;
        const finalLocacao = preserveExistingLocation ? existing.locacao || item.locacao : item.locacao || existing.locacao;

        storageService.updateProduct({
          ...existing,
          descricao: item.descricao || existing.descricao,
          codigo_fabrica: item.codigo_fabrica || existing.codigo_fabrica,
          quantidade: item.quantidade !== undefined && item.quantidade >= 0 ? item.quantidade : existing.quantidade,
          corredor: finalCorredor,
          baia: finalBaia,
          nivel: finalNivel,
          locacao: finalLocacao,
          atualizado_em: new Date().toISOString(),
        });
        batchPayload.push(item);
      }
    });

    // Background sync with PostgreSQL
    if (batchPayload.length > 0) {
      apiService
        .importBatch({
          items: batchPayload,
          fileName: fileName || 'Planilha_Importada.csv',
          preserveExistingLocation,
          archiveOldBarcodesInHistory,
        })
        .catch(err => {
          console.warn('[DB] Importação em lote remota com fallback para storage local:', err.message);
        });
    }

    // Save batch record
    storageService.recordImportBatch(
      fileName || 'Planilha_Importada.csv',
      itemsToProcess.length,
      newCount,
      updatedCount
    );

    setImportSummary({
      total: itemsToProcess.length,
      newCount,
      updatedCount,
    });

    setIsExecuting(false);
    beepService.playSuccess();
    setStep('success');
    onImportCompleted();
  };

  // Load sample demo CSV data
  const handleLoadDemoCSV = () => {
    const demoCSV = `CODIGO;DESCRICAO;COD_FABRICA;COD_BARRAS;QTD;CORREDOR;BAIA;NIVEL;LOCACAO
PRD-0010;LUVA DE VAQUETA MISTA CANO CURTO;LV-100;7891111222333;45;01;A04;02;01-A04-02
PRD-0011;FITA ISOLANTE 3M IMPERIAL 20M;FT-3M-20;7892222333444;80;02;B01;01;02-B01-01
PRD-0012;DISCO DE CORTE FINO 4.1/2 INOX;DC-INOX;7893333444555;120;03;C09;03;03-C09-03
PRD-0001;CHAVE COMBINADA 13MM BELZER CR-V;504.02.1;7899999000111;50;03;B12;04;03-B12-04`;

    setFileName('Demonstrativo_Fornecedor_Lote.csv');
    setCsvText(demoCSV);
    parseDelimitedContent(demoCSV);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              Importação Inteligente de Dados
            </h1>
            <p className="text-xs text-slate-500">
              Mapeador visual de colunas com preservação de localização e histórico de códigos
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-bold dark:border-slate-800">
          <span className={step === 'upload' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}>
            1. Carregar Arquivo
          </span>
          <ArrowRight className="h-3 w-3 text-slate-300" />
          <span className={step === 'mapping' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}>
            2. Mapear Colunas
          </span>
          <ArrowRight className="h-3 w-3 text-slate-300" />
          <span className={step === 'comparacao' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}>
            3. Revisão Comparativa
          </span>
          <ArrowRight className="h-3 w-3 text-slate-300" />
          <span className={step === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
            4. Concluído
          </span>
        </div>
      </div>

      {/* STEP 1: UPLOAD */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
            }}
            className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center hover:border-indigo-500 hover:bg-indigo-50/20 transition dark:border-slate-700 dark:bg-slate-800/50"
          >
            <FileSpreadsheet className="mx-auto h-12 w-12 text-indigo-500 mb-3" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Arraste seu arquivo CSV / TSV aqui
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Ou selecione um arquivo delimitado salvo no seu computador ou celular
            </p>

            <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 shadow">
              <span>Selecionar Arquivo CSV</span>
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 flex items-center justify-between">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Deseja testar sem um arquivo próprio?
            </div>
            <button
              onClick={handleLoadDemoCSV}
              className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Carregar Arquivo CSV de Exemplo
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: MAPPING */}
      {step === 'mapping' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Mapeamento Visual de Colunas: {fileName}
              </h2>
              <p className="text-xs text-slate-500">
                Identificadas {parsedHeaders.length} colunas e {parsedRows.length} linhas de produtos.
              </p>
            </div>
            <button
              onClick={() => setStep('upload')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              Trocar arquivo
            </button>
          </div>

          {/* Mapping Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Descrição do Produto *
              </label>
              <select
                value={fieldMapping.descricao}
                onChange={e => setFieldMapping(prev => ({ ...prev, descricao: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Selecione a coluna...</option>
                {parsedHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Código de Barras (EAN)
              </label>
              <select
                value={fieldMapping.codigo_barras_atual}
                onChange={e => setFieldMapping(prev => ({ ...prev, codigo_barras_atual: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">(Nenhuma)</option>
                {parsedHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Código de Fábrica
              </label>
              <select
                value={fieldMapping.codigo_fabrica}
                onChange={e => setFieldMapping(prev => ({ ...prev, codigo_fabrica: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">(Nenhuma)</option>
                {parsedHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Código Interno
              </label>
              <select
                value={fieldMapping.codigo_atual}
                onChange={e => setFieldMapping(prev => ({ ...prev, codigo_atual: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">(Nenhuma)</option>
                {parsedHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Quantidade em Estoque
              </label>
              <select
                value={fieldMapping.quantidade}
                onChange={e => setFieldMapping(prev => ({ ...prev, quantidade: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">(Nenhuma)</option>
                {parsedHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Locação Descritiva
              </label>
              <select
                value={fieldMapping.locacao}
                onChange={e => setFieldMapping(prev => ({ ...prev, locacao: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">(Nenhuma)</option>
                {parsedHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Códigos Genéricos / Similares
              </label>
              <select
                value={fieldMapping.genericos}
                onChange={e => setFieldMapping(prev => ({ ...prev, genericos: e.target.value }))}
                className="w-full rounded-lg border border-indigo-300 p-2 text-slate-900 dark:border-indigo-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">(Nenhuma)</option>
                {parsedHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Business Safety Options */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800/40 dark:bg-amber-950/20 space-y-3 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
              <Shield className="h-4 w-4 text-amber-600" />
              <span>Regras de Proteção de Dados (Mandatórios KIPSTOCK)</span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={preserveExistingLocation}
                onChange={e => setPreserveExistingLocation(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600"
              />
              <span>
                <strong>Preservar localização física existente:</strong> se a mercadoria já possui endereço no armazém, não sobrescrever em branco.
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={archiveOldBarcodesInHistory}
                onChange={e => setArchiveOldBarcodesInHistory(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600"
              />
              <span>
                <strong>Arquivar código anterior no histórico:</strong> se o código de barras for novo, manter o antigo rastreável.
              </span>
            </label>
          </div>

          {/* Action */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setStep('upload')}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Voltar
            </button>
            <button
              disabled={isComparing}
              onClick={handleStartComparison}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 shadow disabled:opacity-50"
            >
              {isComparing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Comparando com o Banco...</span>
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4" />
                  <span>Analisar e Comparar Dados (Revisão Inteligente)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: COMPARISON REVIEW (Requisito #12) */}
      {step === 'comparacao' && comparisonSummary && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Revisão Comparativa de Dados</span>
              </h2>
              <p className="text-xs text-slate-500">
                O sistema comparou os itens da planilha com a base atual priorizando Código Interno, Código de Barras e Código de Fábrica.
              </p>
            </div>
            <button
              onClick={() => setStep('mapping')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              Alterar Mapeamento
            </button>
          </div>

          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <button
              onClick={() => setFilterComparisonStatus('todos')}
              className={`p-3.5 rounded-xl border text-left transition ${
                filterComparisonStatus === 'todos'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-600'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40'
              }`}
            >
              <span className="text-[11px] font-semibold text-slate-500 block">Total de Itens</span>
              <strong className="text-xl font-black text-slate-900 dark:text-white">{comparisonSummary.total}</strong>
            </button>

            <button
              onClick={() => setFilterComparisonStatus('com_alteracao')}
              className={`p-3.5 rounded-xl border text-left transition ${
                filterComparisonStatus === 'com_alteracao'
                  ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 ring-2 ring-amber-500'
                  : 'border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20'
              }`}
            >
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 block">Com Alteração</span>
              <strong className="text-xl font-black text-amber-600 dark:text-amber-400">{comparisonSummary.comAlteracao}</strong>
            </button>

            <button
              onClick={() => setFilterComparisonStatus('novo')}
              className={`p-3.5 rounded-xl border text-left transition ${
                filterComparisonStatus === 'novo'
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-600'
                  : 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20'
              }`}
            >
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">Novos Produtos</span>
              <strong className="text-xl font-black text-emerald-600 dark:text-emerald-400">{comparisonSummary.novos}</strong>
            </button>

            <button
              onClick={() => setFilterComparisonStatus('sem_alteracao')}
              className={`p-3.5 rounded-xl border text-left transition ${
                filterComparisonStatus === 'sem_alteracao'
                  ? 'border-slate-600 bg-slate-100 dark:bg-slate-800 ring-2 ring-slate-600'
                  : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <span className="text-[11px] font-semibold text-slate-500 block">Sem Alteração</span>
              <strong className="text-xl font-black text-slate-700 dark:text-slate-300">{comparisonSummary.semAlteracao}</strong>
            </button>
          </div>

          {/* List of items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Exibindo itens filtrados ({comparisonItems.filter(c => filterComparisonStatus === 'todos' || c.status === filterComparisonStatus).length})
              </span>
              <span className="text-[11px]">
                {preserveExistingLocation && '🛡️ Localizações físicas preservadas'}
              </span>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 max-h-96 overflow-y-auto">
              {comparisonItems
                .filter(c => filterComparisonStatus === 'todos' || c.status === filterComparisonStatus)
                .map((comp, idx) => {
                  const item = comp.item;
                  const status = comp.status;
                  const diffs = comp.differences || {};
                  const existing = comp.existing;

                  return (
                    <div key={idx} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {item.codigo_atual || item.codigo_barras_atual || item.codigo_fabrica || '(Sem código)'}
                            </span>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {item.descricao}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            {item.codigo_barras_atual && <span>EAN: <strong>{item.codigo_barras_atual}</strong></span>}
                            {item.codigo_fabrica && <span>Fábrica: <strong>{item.codigo_fabrica}</strong></span>}
                            <span>Qtd Planilha: <strong>{item.quantidade ?? 0}</strong></span>
                            {existing && existing.locacao && (
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                Endereço físico: {existing.locacao}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          {status === 'novo' && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 whitespace-nowrap">
                              NOVO
                            </span>
                          )}
                          {status === 'com_alteracao' && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300 whitespace-nowrap">
                              COM ALTERAÇÃO
                            </span>
                          )}
                          {status === 'sem_alteracao' && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400 whitespace-nowrap">
                              SEM ALTERAÇÃO
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Field Differences Box */}
                      {status === 'com_alteracao' && Object.keys(diffs).length > 0 && (
                        <div className="mt-2 rounded-lg bg-amber-50/80 p-2 text-[11px] text-amber-950 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
                          <strong className="block text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300">
                            Diferenças Detectadas:
                          </strong>
                          {Object.entries(diffs).map(([field, diff]: [string, any]) => (
                            <div key={field} className="flex items-center gap-1.5 font-mono">
                              <span className="font-semibold">{field}:</span>
                              <span className="line-through text-slate-400">{String(diff.antiga)}</span>
                              <ArrowRight className="h-3 w-3 text-amber-600" />
                              <span className="font-bold text-amber-900 dark:text-amber-100">{String(diff.nova)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Decision Execution Bar (Requisito #12) */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Escolha a ação de importação:
            </span>

            <div className="flex flex-wrap gap-2.5 justify-end text-xs">
              <button
                type="button"
                onClick={() => setStep('mapping')}
                className="rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Voltar ao Mapeamento
              </button>

              <button
                type="button"
                disabled={isExecuting || comparisonSummary.novos === 0}
                onClick={() => handleExecuteImport('only_new')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white hover:bg-emerald-500 shadow disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span>Importar Apenas Novos ({comparisonSummary.novos})</span>
              </button>

              <button
                type="button"
                disabled={isExecuting || comparisonSummary.comAlteracao === 0}
                onClick={() => handleExecuteImport('only_changed')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 font-bold text-white hover:bg-amber-500 shadow disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isExecuting ? 'animate-spin' : ''}`} />
                <span>Atualizar Apenas Alterados ({comparisonSummary.comAlteracao})</span>
              </button>

              <button
                type="button"
                disabled={isExecuting}
                onClick={() => handleExecuteImport('all')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white hover:bg-indigo-500 shadow disabled:opacity-50"
              >
                <Boxes className="h-4 w-4" />
                <span>Aplicar Tudo ({comparisonSummary.novos + comparisonSummary.comAlteracao})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 'success' && importSummary && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-8 shadow-xl dark:border-emerald-500/80 dark:bg-slate-900 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            Importação Concluída com Sucesso!
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Os dados foram consolidados no armazenamento local e remoto, preservando identificadores e localizações existentes.
          </p>

          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto my-6 text-xs font-mono">
            <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
              <span className="text-slate-500 block text-[10px]">TOTAL</span>
              <strong className="text-lg text-slate-900 dark:text-white">{importSummary.total}</strong>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/50">
              <span className="text-emerald-700 dark:text-emerald-300 block text-[10px]">NOVOS</span>
              <strong className="text-lg text-emerald-600 dark:text-emerald-400">{importSummary.newCount}</strong>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/50">
              <span className="text-indigo-700 dark:text-indigo-300 block text-[10px]">ATUALIZADOS</span>
              <strong className="text-lg text-indigo-600 dark:text-indigo-400">{importSummary.updatedCount}</strong>
            </div>
          </div>

          <button
            onClick={() => setStep('upload')}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 shadow"
          >
            Importar Outra Planilha
          </button>
        </div>
      )}
    </div>
  );
};
