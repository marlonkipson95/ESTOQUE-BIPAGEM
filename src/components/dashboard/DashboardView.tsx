import React, { useMemo } from 'react';
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  MapPinOff,
  History,
  UploadCloud,
  ArrowRight,
  Barcode,
  PackageCheck,
  Search,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Product, ProductCodeHistory, StockMovement, ImportBatch, AppModule, ConsultaFilters } from '../../types';

interface DashboardViewProps {
  products: Product[];
  codeHistory: ProductCodeHistory[];
  movements: StockMovement[];
  importBatches: ImportBatch[];
  onNavigateToModule: (module: AppModule) => void;
  onApplyConsultaFilter: (filter: Partial<ConsultaFilters>) => void;
  onSelectProduct: (product: Product) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  codeHistory,
  movements,
  importBatches,
  onNavigateToModule,
  onApplyConsultaFilter,
  onSelectProduct,
}) => {
  // Calculations otimizadas em loop único para suportar dezenas de milhares de itens
  const {
    totalProducts,
    inStockProducts,
    outOfStockProducts,
    withoutLocation,
    withoutBarcode,
    lowStockProducts,
  } = useMemo(() => {
    const inStock: Product[] = [];
    const outOfStock: Product[] = [];
    const noLoc: Product[] = [];
    const noBar: Product[] = [];
    const lowStock: Product[] = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const q = Number(p.quantidade) || 0;
      if (q > 0) {
        inStock.push(p);
        if (q <= (p.estoque_minimo || 5)) lowStock.push(p);
      } else {
        outOfStock.push(p);
      }
      if (!p.corredor && !p.baia && !p.nivel && !p.locacao) noLoc.push(p);
      if (!p.codigo_barras_atual) noBar.push(p);
    }

    return {
      totalProducts: products.length,
      inStockProducts: inStock,
      outOfStockProducts: outOfStock,
      withoutLocation: noLoc,
      withoutBarcode: noBar,
      lowStockProducts: lowStock,
    };
  }, [products]);

  // Recent updated codes (deactivated or changed in last 30 days)
  const recentlyUpdatedCodes = codeHistory.filter(h => !h.ativo || h.motivo?.includes('Substituído'));
  const latestImport = importBatches[0];

  // Handlers for clicking alerts
  const handleAlertClick = (filter: Partial<ConsultaFilters>) => {
    onApplyConsultaFilter(filter);
    onNavigateToModule('consulta');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner with Quick Actions */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-5 md:p-6 text-white shadow-lg border border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-300 border border-indigo-400/30">
              <Barcode className="h-3.5 w-3.5" />
              <span>Operação de Armazém</span>
            </div>
            <h1 className="mt-2 text-xl md:text-2xl font-black text-white">
              Painel Operacional do Estoque
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Identificação ágil de mercadorias, conferência física de prateleiras e localização imediata de itens.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => onNavigateToModule('bipagem')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-indigo-500 active:scale-95 transition"
            >
              <Barcode className="h-4 w-4" />
              <span>Bipar Produto</span>
            </button>
            <button
              onClick={() => onNavigateToModule('recebimento')}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <PackageCheck className="h-4 w-4 text-emerald-400" />
              <span>Recebimento</span>
            </button>
            <button
              onClick={() => onNavigateToModule('consulta')}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <Search className="h-4 w-4 text-sky-400" />
              <span>Consultar</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1. Main Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {/* Total Products */}
        <div
          onClick={() => {
            onApplyConsultaFilter({ estoque: 'todos', cadastro: 'todos' });
            onNavigateToModule('consulta');
          }}
          className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-400 hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Produtos
            </span>
            <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-2 font-mono text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
            {totalProducts.toLocaleString('pt-BR')}
          </div>
          <span className="text-[11px] text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center gap-1 mt-1 font-medium">
            Ver catálogo <ArrowRight className="h-3 w-3" />
          </span>
        </div>

        {/* In Stock */}
        <div
          onClick={() => {
            onApplyConsultaFilter({ estoque: 'com_estoque' });
            onNavigateToModule('consulta');
          }}
          className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-400 hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Com Estoque
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-mono text-2xl md:text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {inStockProducts.length.toLocaleString('pt-BR')}
          </div>
          <span className="text-[11px] text-slate-400 group-hover:text-emerald-600 flex items-center gap-1 mt-1 font-medium">
            {totalProducts > 0 ? `${Math.round((inStockProducts.length / totalProducts) * 100)}% do catálogo` : '0%'}
          </span>
        </div>

        {/* Out of Stock */}
        <div
          onClick={() => {
            onApplyConsultaFilter({ estoque: 'sem_estoque' });
            onNavigateToModule('consulta');
          }}
          className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-rose-400 hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Sem Estoque
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 font-mono text-2xl md:text-3xl font-black text-rose-600 dark:text-rose-400">
            {outOfStockProducts.length.toLocaleString('pt-BR')}
          </div>
          <span className="text-[11px] text-slate-400 group-hover:text-rose-600 flex items-center gap-1 mt-1 font-medium">
            Filtrar zerados <ArrowRight className="h-3 w-3" />
          </span>
        </div>

        {/* Without Location */}
        <div
          onClick={() => {
            onApplyConsultaFilter({ cadastro: 'sem_locacao' });
            onNavigateToModule('consulta');
          }}
          className={`group cursor-pointer rounded-xl border p-4 shadow-sm transition ${
            withoutLocation.length > 0
              ? 'border-amber-300 bg-amber-50/50 hover:border-amber-500 dark:border-amber-700/50 dark:bg-amber-950/20'
              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Sem Locação
            </span>
            <MapPinOff className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl md:text-3xl font-black text-amber-600 dark:text-amber-400">
            {withoutLocation.length.toLocaleString('pt-BR')}
          </div>
          <span className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-1 font-medium">
            Necessita endereço <ArrowRight className="h-3 w-3" />
          </span>
        </div>

        {/* Recent Code Updates */}
        <div
          onClick={() => onNavigateToModule('produtos')}
          className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-400 hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Códigos Ativados
            </span>
            <History className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-2 font-mono text-2xl md:text-3xl font-black text-sky-600 dark:text-sky-400">
            {codeHistory.length.toLocaleString('pt-BR')}
          </div>
          <span className="text-[11px] text-slate-400 group-hover:text-sky-600 flex items-center gap-1 mt-1 font-medium">
            Histórico mantido
          </span>
        </div>

        {/* Recent Imports */}
        <div
          onClick={() => onNavigateToModule('importacao')}
          className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-400 hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Importações
            </span>
            <UploadCloud className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 font-mono text-2xl md:text-3xl font-black text-indigo-600 dark:text-indigo-400">
            {importBatches.length.toLocaleString('pt-BR')}
          </div>
          <span className="text-[11px] text-slate-400 group-hover:text-indigo-600 flex items-center gap-1 mt-1 font-medium">
            {latestImport ? `${latestImport.total} itens no lote` : 'Importar planilha'}
          </span>
        </div>
      </div>

      {/* 2. ATENÇÃO (Alerts Area) & 3. Atividades Recentes (2-column layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ATENÇÃO Panel (Clickable alerts) */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span>ATENÇÃO / ALERTAS DO CADASTRO</span>
            </h2>
            <span className="text-xs text-slate-500">Clique para abrir a lista filtrada</span>
          </div>

          <div className="space-y-2.5">
            {/* Alert: Sem localização */}
            <div
              onClick={() => handleAlertClick({ cadastro: 'sem_locacao' })}
              className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 hover:bg-amber-100/70 cursor-pointer transition dark:border-amber-800/40 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  <MapPinOff className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-amber-950 dark:text-amber-200">
                    Produtos sem localização física
                  </div>
                  <div className="text-xs text-amber-800/80 dark:text-amber-400">
                    Mercadorias cadastradas que ainda não possuem corredor, baia ou nível atribuído.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-black text-amber-700 dark:text-amber-300">
                  {withoutLocation.length}
                </span>
                <ArrowRight className="h-4 w-4 text-amber-600" />
              </div>
            </div>

            {/* Alert: Sem código de barras */}
            <div
              onClick={() => handleAlertClick({ cadastro: 'sem_barras' })}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 hover:bg-slate-50 cursor-pointer transition dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Barcode className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    Produtos sem código de barras (EAN)
                  </div>
                  <div className="text-xs text-slate-500">
                    Itens que dependem de digitação manual de código de fábrica ou código interno.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-black text-slate-700 dark:text-slate-300">
                  {withoutBarcode.length}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
            </div>

            {/* Alert: Estoque baixo */}
            <div
              onClick={() => handleAlertClick({ estoque: 'baixo_estoque' })}
              className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50/70 p-3.5 hover:bg-orange-100/70 cursor-pointer transition dark:border-orange-800/40 dark:bg-orange-950/20 dark:hover:bg-orange-950/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/20 text-orange-700 dark:text-orange-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-orange-950 dark:text-orange-200">
                    Produtos com estoque baixo
                  </div>
                  <div className="text-xs text-orange-800/80 dark:text-orange-400">
                    Quantidade em estoque abaixo do ponto de reposição recomendado.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-black text-orange-700 dark:text-orange-300">
                  {lowStockProducts.length}
                </span>
                <ArrowRight className="h-4 w-4 text-orange-600" />
              </div>
            </div>

            {/* Alert: Histórico de códigos antigos preservados */}
            <div
              onClick={() => handleAlertClick({ tipoCodigo: 'codigo_antigo' })}
              className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 hover:bg-sky-100/70 cursor-pointer transition dark:border-sky-800/40 dark:bg-sky-950/20 dark:hover:bg-sky-950/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/20 text-sky-700 dark:text-sky-300">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-sky-950 dark:text-sky-200">
                    Códigos históricos vinculados
                  </div>
                  <div className="text-xs text-sky-800/80 dark:text-sky-400">
                    Códigos antigos desativados mas preservados para identificação determinística na bipagem.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-black text-sky-700 dark:text-sky-300">
                  {codeHistory.filter(h => !h.ativo).length}
                </span>
                <ArrowRight className="h-4 w-4 text-sky-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Atividades Recentes */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              <span>ATIVIDADES RECENTES DO GALPÃO</span>
            </h2>
            <span className="text-xs text-slate-500">Últimas operações</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
            {/* Last import record */}
            {latestImport ? (
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 border border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
                <UploadCloud className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      Última Importação: {latestImport.arquivo}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(latestImport.data).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {latestImport.total} itens processados • {latestImport.novos} novos • {latestImport.atualizados} atualizados.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Recent movements feed */}
            <div className="space-y-2">
              {movements.slice(0, 4).map(m => {
                const relatedProduct = products.find(p => p.id === m.produto_id);

                return (
                  <div
                    key={m.id}
                    onClick={() => relatedProduct && onSelectProduct(relatedProduct)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          m.tipo === 'recebimento'
                            ? 'bg-emerald-500'
                            : m.tipo === 'alteracao_codigo'
                            ? 'bg-sky-500'
                            : 'bg-indigo-500'
                        }`}
                      />
                      <div className="truncate">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {relatedProduct?.descricao || m.detalhes}
                        </span>
                        <div className="text-[11px] text-slate-500 truncate">{m.detalhes}</div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex justify-between items-center text-xs">
              <span className="text-slate-400">Rastreabilidade completa mantida</span>
              <button
                onClick={() => onNavigateToModule('produtos')}
                className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 inline-flex items-center gap-1"
              >
                Ver todos produtos <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
