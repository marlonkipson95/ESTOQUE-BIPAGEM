import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  X,
  SlidersHorizontal,
  MapPin,
  Barcode,
  Package,
  Layers,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { Product, ProductCodeHistory, ConsultaFilters } from '../../types';
import { LocationBadge } from '../common/LocationBadge';
import { formatCurrency } from '../../utils/formatters';
import { GenericProductsModal } from '../common/GenericProductsModal';
import { AdaptivePrice } from '../common/AdaptivePrice';

interface ConsultaViewProps {
  products: Product[];
  codeHistory: ProductCodeHistory[];
  filters: ConsultaFilters;
  onUpdateFilters: (filters: Partial<ConsultaFilters>) => void;
  onResetFilters: () => void;
  onSelectProduct: (product: Product) => void;
  onOpenQuickScan: () => void;
}

export const ConsultaView: React.FC<ConsultaViewProps> = ({
  products,
  codeHistory,
  filters,
  onUpdateFilters,
  onResetFilters,
  onSelectProduct,
  onOpenQuickScan,
}) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(48);
  const [genericModalProduct, setGenericModalProduct] = useState<Product | null>(null);

  const formatPriceOnlyNumber = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return '0,00';
    return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    setDisplayLimit(48);
  }, [filters]);

  // Available unique locations for filter selects
  const uniqueCorredores = useMemo(() => {
    const list = Array.from(new Set(products.map(p => p.corredor).filter(Boolean))).sort();
    return list;
  }, [products]);

  const uniqueBaias = useMemo(() => {
    const list = Array.from(new Set(products.map(p => p.baia).filter(Boolean))).sort();
    return list;
  }, [products]);

  const uniqueNiveis = useMemo(() => {
    const list = Array.from(new Set(products.map(p => p.nivel).filter(Boolean))).sort();
    return list;
  }, [products]);

  // Combined Search & Filter logic
  const filteredProducts = useMemo(() => {
    const term = filters.searchTerm.trim().toLowerCase();

    return products.filter(product => {
      // 1. Omni-Search matching:
      // - código interno atual
      // - código fábrica
      // - código barras atual
      // - descrição
      // - códigos antigos do histórico
      if (term) {
        const matchesCurrent =
          (product.codigo_atual && product.codigo_atual.toLowerCase().includes(term)) ||
          (product.codigo_fabrica && product.codigo_fabrica.toLowerCase().includes(term)) ||
          (product.codigo_barras_atual && product.codigo_barras_atual.toLowerCase().includes(term)) ||
          (product.descricao && product.descricao.toLowerCase().includes(term)) ||
          (product.locacao && product.locacao.toLowerCase().includes(term));

        if (!matchesCurrent) {
          // Check historical codes for this product
          const matchesHistory = codeHistory.some(
            h => h.produto_id === product.id && h.codigo.toLowerCase().includes(term)
          );
          if (!matchesHistory) return false;
        }
      }

      // 2. Filter: Localização (Corredor, Baia, Nível, Locação)
      if (filters.corredor && product.corredor !== filters.corredor) return false;
      if (filters.baia && product.baia !== filters.baia) return false;
      if (filters.nivel && product.nivel !== filters.nivel) return false;
      if (filters.locacao && !product.locacao.toLowerCase().includes(filters.locacao.toLowerCase())) return false;

      // 3. Filter: Estoque
      if (filters.estoque === 'com_estoque' && product.quantidade <= 0) return false;
      if (filters.estoque === 'sem_estoque' && product.quantidade > 0) return false;
      if (filters.estoque === 'baixo_estoque' && (product.quantidade <= 0 || product.quantidade > (product.estoque_minimo || 5))) return false;

      // 4. Filter: Cadastro
      if (filters.cadastro === 'com_barras' && !product.codigo_barras_atual) return false;
      if (filters.cadastro === 'sem_barras' && Boolean(product.codigo_barras_atual)) return false;
      if (filters.cadastro === 'com_locacao' && (!product.corredor && !product.baia && !product.nivel && !product.locacao)) return false;
      if (filters.cadastro === 'sem_locacao' && (product.corredor || product.baia || product.nivel || product.locacao)) return false;

      // 5. Filter: Tipo de código
      if (filters.tipoCodigo === 'codigo_barras' && !product.codigo_barras_atual) return false;
      if (filters.tipoCodigo === 'codigo_fabrica' && !product.codigo_fabrica) return false;
      if (filters.tipoCodigo === 'codigo_antigo') {
        const hasOldCode = codeHistory.some(h => h.produto_id === product.id && !h.ativo);
        if (!hasOldCode) return false;
      }

      return true;
    });
  }, [products, codeHistory, filters]);

  // Produtos fatiados para renderização progressiva leve e rápida
  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, displayLimit);
  }, [filteredProducts, displayLimit]);

  // Active filters count and list for badges
  const activeFilterPills = useMemo(() => {
    const pills: { label: string; onRemove: () => void }[] = [];
    if (filters.corredor) {
      pills.push({
        label: `Corredor: ${filters.corredor}`,
        onRemove: () => onUpdateFilters({ corredor: '' }),
      });
    }
    if (filters.baia) {
      pills.push({
        label: `Baia: ${filters.baia}`,
        onRemove: () => onUpdateFilters({ baia: '' }),
      });
    }
    if (filters.nivel) {
      pills.push({
        label: `Nível: ${filters.nivel}`,
        onRemove: () => onUpdateFilters({ nivel: '' }),
      });
    }
    if (filters.locacao) {
      pills.push({
        label: `Locação: ${filters.locacao}`,
        onRemove: () => onUpdateFilters({ locacao: '' }),
      });
    }
    if (filters.estoque !== 'todos') {
      const mapEstoque: Record<string, string> = {
        com_estoque: 'Com Estoque',
        sem_estoque: 'Sem Estoque',
        baixo_estoque: 'Estoque Baixo',
      };
      pills.push({
        label: `Estoque: ${mapEstoque[filters.estoque]}`,
        onRemove: () => onUpdateFilters({ estoque: 'todos' }),
      });
    }
    if (filters.cadastro !== 'todos') {
      const mapCadastro: Record<string, string> = {
        com_barras: 'Com Cód. Barras',
        sem_barras: 'Sem Cód. Barras',
        com_locacao: 'Com Localização',
        sem_locacao: 'Sem Localização',
      };
      pills.push({
        label: `Cadastro: ${mapCadastro[filters.cadastro]}`,
        onRemove: () => onUpdateFilters({ cadastro: 'todos' }),
      });
    }
    if (filters.tipoCodigo !== 'todos') {
      const mapCodigo: Record<string, string> = {
        codigo_atual: 'Código Atual',
        codigo_antigo: 'Com Código Antigo',
        codigo_barras: 'Código Barras',
        codigo_fabrica: 'Código Fábrica',
      };
      pills.push({
        label: `Tipo: ${mapCodigo[filters.tipoCodigo]}`,
        onRemove: () => onUpdateFilters({ tipoCodigo: 'todos' }),
      });
    }
    return pills;
  }, [filters, onUpdateFilters]);

  return (
    <div className="space-y-5 pb-16">
      {/* 4. BUSCA PRINCIPAL (Omni-search large input) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col md:flex-row items-stretch gap-3">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
              <Search className="h-5 w-5" />
            </div>
            <input
              type="text"
              value={filters.searchTerm}
              onChange={e => onUpdateFilters({ searchTerm: e.target.value })}
              placeholder="Pesquisar por código, código de barras, código de fábrica ou descrição..."
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-3.5 pl-11 pr-10 text-sm md:text-base font-medium text-slate-900 placeholder-slate-400 transition focus:border-indigo-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-500"
            />
            {filters.searchTerm && (
              <button
                onClick={() => onUpdateFilters({ searchTerm: '' })}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setShowAdvancedFilters(prev => !prev)}
              className={`flex-1 md:flex-initial inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition border ${
                showAdvancedFilters || activeFilterPills.length > 0
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filtros</span>
              {activeFilterPills.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                  {activeFilterPills.length}
                </span>
              )}
            </button>

            <button
              onClick={onOpenQuickScan}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition shadow-sm"
              title="Bipar código com a câmera"
            >
              <Barcode className="h-4 w-4" />
              <span>Bipar</span>
            </button>
          </div>
        </div>

        {/* 5. FILTROS AVANÇADOS ACCORDION */}
        {showAdvancedFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Localização */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-indigo-500" /> Corredor
              </label>
              <select
                value={filters.corredor}
                onChange={e => onUpdateFilters({ corredor: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">Todos os corredores</option>
                {uniqueCorredores.map(c => (
                  <option key={c} value={c}>Corredor {c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Baia
              </label>
              <select
                value={filters.baia}
                onChange={e => onUpdateFilters({ baia: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">Todas as baias</option>
                {uniqueBaias.map(b => (
                  <option key={b} value={b}>Baia {b}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Nível
              </label>
              <select
                value={filters.nivel}
                onChange={e => onUpdateFilters({ nivel: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">Todos os níveis</option>
                {uniqueNiveis.map(n => (
                  <option key={n} value={n}>Nível {n}</option>
                ))}
              </select>
            </div>

            {/* Situação de Estoque */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-emerald-500" /> Situação Estoque
              </label>
              <select
                value={filters.estoque}
                onChange={e => onUpdateFilters({ estoque: e.target.value as any })}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="todos">Todos os status</option>
                <option value="com_estoque">Com estoque disponível</option>
                <option value="sem_estoque">Sem estoque (Zerados)</option>
                <option value="baixo_estoque">Estoque baixo (Reposição)</option>
              </select>
            </div>

            {/* Situação de Cadastro */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-sky-500" /> Cadastro & Código
              </label>
              <select
                value={filters.cadastro}
                onChange={e => onUpdateFilters({ cadastro: e.target.value as any })}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="todos">Qualquer cadastro</option>
                <option value="com_barras">Com código de barras (EAN)</option>
                <option value="sem_barras">Sem código de barras</option>
                <option value="com_locacao">Com localização definida</option>
                <option value="sem_locacao">Sem localização definida</option>
              </select>
            </div>

            {/* Tipo de Código */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Origem do Código
              </label>
              <select
                value={filters.tipoCodigo}
                onChange={e => onUpdateFilters({ tipoCodigo: e.target.value as any })}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="todos">Todos os tipos de código</option>
                <option value="codigo_atual">Código atual</option>
                <option value="codigo_antigo">Possui código antigo</option>
                <option value="codigo_barras">Código de barras</option>
                <option value="codigo_fabrica">Código de fábrica</option>
              </select>
            </div>
          </div>
        )}

        {/* Active Filters Bar */}
        {activeFilterPills.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500">Filtros ativos:</span>
            {activeFilterPills.map((pill, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300"
              >
                <span>{pill.label}</span>
                <button
                  onClick={pill.onRemove}
                  className="rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            <button
              onClick={onResetFilters}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition ml-auto"
            >
              <RotateCcw className="h-3 w-3" />
              <span>LIMPAR FILTROS</span>
            </button>
          </div>
        )}
      </div>

      {/* 6. RESULTADOS DA CONSULTA */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs md:text-sm font-semibold text-slate-500 dark:text-slate-400">
            Mostrando <strong className="text-slate-900 dark:text-white">{filteredProducts.length}</strong> de {products.length} mercadorias
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-3 text-base font-bold text-slate-800 dark:text-white">
              Nenhuma mercadoria encontrada
            </h3>
            <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
              Nenhum produto corresponde aos termos ou filtros selecionados. Tente limpar os filtros ou realizar uma busca mais ampla.
            </p>
            <button
              onClick={onResetFilters}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
            >
              Limpar Filtros de Busca
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleProducts.map(product => {
                const isOutOfStock = product.quantidade <= 0;
                const isLowStock = !isOutOfStock && product.quantidade <= (product.estoque_minimo || 5);

                return (
                  <div
                    key={product.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm hover:border-indigo-400 hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      {/* 1. CÓDIGO DE FÁBRICA & ESTOQUE */}
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-0.5">
                            CÓDIGO DE FÁBRICA
                          </span>
                          <strong className="font-mono text-base sm:text-xl font-black text-slate-900 dark:text-white break-all block leading-tight">
                            {product.codigo_fabrica || product.codigo_atual || '—'}
                          </strong>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-black tracking-wide uppercase shrink-0 ${
                            isOutOfStock
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                              : isLowStock
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          }`}
                        >
                          {isOutOfStock ? 'Sem estoque' : `${product.quantidade} un`}
                        </span>
                      </div>

                      {/* 2. DESCRIÇÃO */}
                      <h3 className="mt-2.5 text-sm sm:text-base font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                        {product.descricao}
                      </h3>

                      {/* 3. LOCALIZAÇÃO FÍSICA NO ESTOQUE */}
                      <div className="mt-3.5">
                        <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span>Localização no Estoque</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-900 text-white rounded-xl p-2 sm:p-2.5 border border-slate-800 shadow-sm">
                          <div className="rounded-lg bg-slate-800/80 py-1.5 min-w-0">
                            <span className="block text-[8px] sm:text-[9px] uppercase font-bold text-amber-300">Corredor</span>
                            <span className="font-mono text-lg sm:text-2xl font-black text-amber-400 truncate block">
                              {product.corredor || '—'}
                            </span>
                          </div>
                          <div className="rounded-lg bg-slate-800/80 py-1.5 min-w-0">
                            <span className="block text-[8px] sm:text-[9px] uppercase font-bold text-emerald-300">Baia</span>
                            <span className="font-mono text-lg sm:text-2xl font-black text-emerald-400 truncate block">
                              {product.baia || '—'}
                            </span>
                          </div>
                          <div className="rounded-lg bg-slate-800/80 py-1.5 min-w-0">
                            <span className="block text-[8px] sm:text-[9px] uppercase font-bold text-sky-300">Nível</span>
                            <span className="font-mono text-lg sm:text-2xl font-black text-sky-400 truncate block">
                              {product.nivel || '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* CÓDIGOS GENÉRICOS / PEÇAS COMPATÍVEIS */}
                      <div className="mt-3 flex items-center justify-between gap-1.5 p-2 rounded-xl border border-indigo-100 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                        <button
                          type="button"
                          onClick={() => setGenericModalProduct(product)}
                          className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-700 dark:text-indigo-300 hover:underline"
                        >
                          <Layers className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>
                            {(product.total_genericos ?? (Array.isArray(product.produtos_relacionados) ? product.produtos_relacionados.length : 0))} cd. genérico{(product.total_genericos ?? (Array.isArray(product.produtos_relacionados) ? product.produtos_relacionados.length : 0)) !== 1 ? 's' : ''}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setGenericModalProduct(product)}
                          className="inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100/70 dark:text-indigo-300 dark:hover:bg-indigo-900/50 transition"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Vincular</span>
                        </button>
                      </div>

                      {/* 4. PREÇOS DE VENDA (TABELA, SUGERIDO, MÍNIMO) - PREÇO DE VENDA (R$) COM FONTE AMPLIADA */}
                      <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                        <span className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                          Preço de Venda (R$)
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                          <div className="rounded-xl bg-slate-100/90 p-1.5 sm:p-2 border-2 border-slate-300 dark:bg-slate-800 dark:border-slate-700 min-w-0 shadow-sm flex flex-col justify-center">
                            <span className="block text-[9px] sm:text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">
                              TABELA
                            </span>
                            <AdaptivePrice value={product.preco_tabela} />
                          </div>
                          <div className="rounded-xl bg-indigo-50 p-1.5 sm:p-2 border-2 border-indigo-300 dark:bg-indigo-950/60 dark:border-indigo-700 min-w-0 shadow-sm flex flex-col justify-center">
                            <span className="block text-[9px] sm:text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-0.5">
                              SUGERIDO
                            </span>
                            <AdaptivePrice value={product.preco_sugerido} colorClass="text-indigo-800 dark:text-indigo-200" />
                          </div>
                          <div className="rounded-xl bg-emerald-50 p-1.5 sm:p-2 border-2 border-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-700 min-w-0 shadow-sm flex flex-col justify-center">
                            <span className="block text-[9px] sm:text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider mb-0.5">
                              MÍNIMO
                            </span>
                            <AdaptivePrice value={product.preco_minimo} colorClass="text-emerald-800 dark:text-emerald-300" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Action */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => onSelectProduct(product)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition shadow-sm"
                      >
                        <span>VER PRODUTO</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* BOTÃO CARREGAR MAIS (PROGRESSIVO PARA ALTO DESEMPENHO) */}
            {filteredProducts.length > displayLimit && (
              <div className="pt-4 pb-8 flex flex-col items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setDisplayLimit(prev => prev + 48)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-xs md:text-sm font-bold text-white shadow-md hover:bg-indigo-500 transition active:scale-95"
                >
                  <span>Carregar mais mercadorias (+48)</span>
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Exibindo {visibleProducts.length} de {filteredProducts.length} produtos encontrados
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE CÓDIGOS GENÉRICOS / PEÇAS COMPATÍVEIS */}
      {genericModalProduct && (
        <GenericProductsModal
          isOpen={Boolean(genericModalProduct)}
          onClose={() => setGenericModalProduct(null)}
          product={genericModalProduct}
          onSelectProduct={onSelectProduct}
        />
      )}
    </div>
  );
};
