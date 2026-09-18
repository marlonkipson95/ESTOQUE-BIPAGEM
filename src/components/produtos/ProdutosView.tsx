import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  Plus,
  Search,
  MapPin,
  Barcode,
  History,
  Edit,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Product, ProductCodeHistory } from '../../types';
import { LocationBadge } from '../common/LocationBadge';

interface ProdutosViewProps {
  products: Product[];
  codeHistory: ProductCodeHistory[];
  onSelectProduct: (product: Product) => void;
  onOpenNewProduct: () => void;
}

export const ProdutosView: React.FC<ProdutosViewProps> = ({
  products,
  codeHistory,
  onSelectProduct,
  onOpenNewProduct,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'descricao' | 'codigo' | 'quantidade' | 'locacao'>('descricao');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Mapa otimizado O(1) de histórico para não travar a listagem de milhares de itens
  const historyCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < codeHistory.length; i++) {
      const h = codeHistory[i];
      if (!h.ativo && h.produto_id) {
        map.set(h.produto_id, (map.get(h.produto_id) || 0) + 1);
      }
    }
    return map;
  }, [codeHistory]);

  const filteredAndSorted = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = products.filter(p => {
      if (!term) return true;
      return (
        (p.descricao && p.descricao.toLowerCase().includes(term)) ||
        (p.codigo_atual && p.codigo_atual.toLowerCase().includes(term)) ||
        (p.codigo_fabrica && p.codigo_fabrica.toLowerCase().includes(term)) ||
        (p.codigo_barras_atual && p.codigo_barras_atual.toLowerCase().includes(term)) ||
        (p.locacao && p.locacao.toLowerCase().includes(term))
      );
    });

    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'descricao') {
        comparison = (a.descricao || '').localeCompare(b.descricao || '');
      } else if (sortBy === 'codigo') {
        comparison = (a.codigo_atual || '').localeCompare(b.codigo_atual || '');
      } else if (sortBy === 'quantidade') {
        comparison = (Number(a.quantidade) || 0) - (Number(b.quantidade) || 0);
      } else if (sortBy === 'locacao') {
        comparison = (a.locacao || '').localeCompare(b.locacao || '');
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [products, searchTerm, sortBy, sortOrder]);

  // Reset de página ao buscar ou reordenar
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / itemsPerPage));

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSorted.slice(start, start + itemsPerPage);
  }, [filteredAndSorted, currentPage, itemsPerPage]);

  const toggleSort = (field: 'descricao' | 'codigo' | 'quantidade' | 'locacao') => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-5 pb-16">
      {/* Top Header & New Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Boxes className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            <span>Catálogo de Produtos</span>
          </h1>
          <p className="text-xs text-slate-500">
            {products.length} mercadorias registradas com histórico permanente
          </p>
        </div>

        <button
          onClick={onOpenNewProduct}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs md:text-sm font-bold text-white shadow hover:bg-indigo-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Produto</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filtrar por descrição, código de barras, código fábrica ou locação..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs md:text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/30"
            />
          </div>
        </div>
      </div>

      {/* Responsive Table / Cards */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              <tr>
                <th
                  onClick={() => toggleSort('codigo')}
                  className="cursor-pointer py-3.5 px-4 font-bold uppercase tracking-wider hover:text-indigo-600"
                >
                  <div className="flex items-center gap-1">
                    <span>Código</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('descricao')}
                  className="cursor-pointer py-3.5 px-4 font-bold uppercase tracking-wider hover:text-indigo-600"
                >
                  <div className="flex items-center gap-1">
                    <span>Descrição</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider">
                  Cód. Barras / Fábrica
                </th>
                <th
                  onClick={() => toggleSort('locacao')}
                  className="cursor-pointer py-3.5 px-4 font-bold uppercase tracking-wider hover:text-indigo-600"
                >
                  <div className="flex items-center gap-1">
                    <span>Localização Física</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('quantidade')}
                  className="cursor-pointer py-3.5 px-4 font-bold uppercase tracking-wider text-right hover:text-indigo-600"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Estoque</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center font-bold uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedProducts.map(product => {
                const historyCount = historyCountMap.get(product.id) || 0;

                return (
                  <tr
                    key={product.id}
                    onClick={() => onSelectProduct(product)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {product.codigo_atual}
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white max-w-xs truncate">
                      {product.descricao}
                      {historyCount > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                          <History className="h-3 w-3" />
                          <span>{historyCount} cód. antigos</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                      <div>EAN: {product.codigo_barras_atual || '—'}</div>
                      <div className="text-[11px] text-slate-400">Fábrica: {product.codigo_fabrica || '—'}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <LocationBadge
                        corredor={product.corredor}
                        baia={product.baia}
                        nivel={product.nivel}
                        locacao={product.locacao}
                        size="compact"
                      />
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          product.quantidade <= 0
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {product.quantidade} un
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onSelectProduct(product);
                        }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
                        title="Editar produto"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {paginatedProducts.map(product => (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="p-3.5 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {product.codigo_atual}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-mono font-bold shrink-0 ${
                    product.quantidade <= 0
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  }`}
                >
                  {product.quantidade} un
                </span>
              </div>

              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                {product.descricao}
              </h3>

              {/* Destaque do Código de Fábrica / EAN no Mobile */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono">
                {product.codigo_fabrica && (
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900">
                    Fábrica: {product.codigo_fabrica}
                  </span>
                )}
                {product.codigo_barras_atual && (
                  <span className="text-slate-500 text-[11px]">
                    EAN: {product.codigo_barras_atual}
                  </span>
                )}
              </div>

              <LocationBadge
                corredor={product.corredor}
                baia={product.baia}
                nivel={product.nivel}
                locacao={product.locacao}
                size="compact"
              />
            </div>
          ))}
        </div>

        {/* Controles de Paginação */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Página <strong className="text-slate-900 dark:text-white">{currentPage}</strong> de <strong>{totalPages}</strong> ({filteredAndSorted.length} produtos)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </button>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                <span>Próxima</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
