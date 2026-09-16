import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Calculator, Plus, Search, Trash2, Printer, Save, 
  ChevronLeft, AlertTriangle, Check, User 
} from 'lucide-react';
import { Product, Orcamento, OrcamentoItem } from '../../types';
import { apiService } from '../../services/apiService';

interface OrcamentoViewProps {
  products: Product[];
  onOpenQuickScan: () => void;
  externalScannedCode: string;
  onClearExternalScannedCode: () => void;
}

const RESPONSAVEIS = ['Vladimir', 'Thiago', 'Alexandro', 'Marlon', 'Lucas'];

export const OrcamentoView: React.FC<OrcamentoViewProps> = ({
  products,
  onOpenQuickScan,
  externalScannedCode,
  onClearExternalScannedCode
}) => {
  const [viewState, setViewState] = useState<'list' | 'edit'>('list');
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [loading, setLoading] = useState(true);
  
  // List Filters
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>('');
  
  // Current Edit State
  const [currentOrcamento, setCurrentOrcamento] = useState<Partial<Orcamento>>({
    nome_cliente: '',
    responsavel: '',
    itens: [],
    total_orcamento: 0
  });
  
  // Adding Item State
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Distribution State
  const [orcamentoDesejado, setOrcamentoDesejado] = useState<string>('');
  const [permitirAbaixoMinimo, setPermitirAbaixoMinimo] = useState(false);
  const [distribuicaoErro, setDistribuicaoErro] = useState('');

  // Fetch initial list
  useEffect(() => {
    carregarOrcamentos();
  }, []);

  const carregarOrcamentos = async () => {
    setLoading(true);
    try {
      const data = await apiService.getOrcamentos();
      setOrcamentos(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Listen to external barcode scanner
  useEffect(() => {
    if (externalScannedCode && viewState === 'edit') {
      const match = products.find(p => 
        p.codigo_barras_atual === externalScannedCode || 
        p.codigo_atual === externalScannedCode || 
        p.codigo_fabrica === externalScannedCode ||
        p.codigos_alternativos?.includes(externalScannedCode)
      );
      if (match) {
        addItem(match);
      }
      onClearExternalScannedCode();
    }
  }, [externalScannedCode, viewState, products]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return products.filter(p => 
      p.descricao.toLowerCase().includes(term) ||
      p.codigo_atual.toLowerCase().includes(term) ||
      p.codigo_fabrica.toLowerCase().includes(term) ||
      p.codigo_barras_atual?.toLowerCase().includes(term)
    ).slice(0, 10);
  }, [searchTerm, products]);

  const addItem = (p: Product) => {
    const defaultPrice = p.preco_sugerido || p.preco_tabela || p.preco_minimo || 0;
    const newItem: OrcamentoItem = {
      id: `item-${Date.now()}`,
      produto_id: p.id,
      descricao: p.descricao,
      quantidade: 1,
      preco_tabela: p.preco_tabela,
      preco_sugerido: p.preco_sugerido,
      preco_minimo: p.preco_minimo,
      valor_unitario: defaultPrice,
      subtotal: defaultPrice
    };

    setCurrentOrcamento(prev => ({
      ...prev,
      itens: [...(prev.itens || []), newItem]
    }));
    setSearchTerm('');
    setShowDropdown(false);
  };

  const removeItem = (id: string) => {
    setCurrentOrcamento(prev => ({
      ...prev,
      itens: (prev.itens || []).filter(i => i.id !== id)
    }));
  };

  const updateItemQty = (id: string, qty: number) => {
    setCurrentOrcamento(prev => ({
      ...prev,
      itens: (prev.itens || []).map(i => {
        if (i.id === id) {
          const q = Math.max(1, qty);
          return { ...i, quantidade: q, subtotal: q * i.valor_unitario };
        }
        return i;
      })
    }));
  };

  const updateItemPrice = (id: string, price: number) => {
    setCurrentOrcamento(prev => ({
      ...prev,
      itens: (prev.itens || []).map(i => {
        if (i.id === id) {
          const p = Math.max(0, price);
          return { ...i, valor_unitario: p, subtotal: i.quantidade * p };
        }
        return i;
      })
    }));
  };

  const currentTotal = (currentOrcamento.itens || []).reduce((acc, item) => acc + item.subtotal, 0);

  const handleDistribuirDesconto = () => {
    setDistribuicaoErro('');
    const items = currentOrcamento.itens || [];
    if (items.length === 0) return;

    const parsedDesejado = parseFloat(orcamentoDesejado.replace(',', '.'));
    if (isNaN(parsedDesejado) || parsedDesejado <= 0) return;

    if (parsedDesejado >= currentTotal) {
      setDistribuicaoErro('O valor desejado deve ser menor que o total atual para aplicar desconto.');
      return;
    }

    const totalDesconto = currentTotal - parsedDesejado;
    let newItems = [...items];
    let bloqueado = false;

    newItems = newItems.map(item => {
      const proportion = item.subtotal / currentTotal;
      const discountForThisItem = totalDesconto * proportion;
      const discountPerUnit = discountForThisItem / item.quantidade;
      let newPrice = item.valor_unitario - discountPerUnit;

      if (item.preco_minimo && newPrice < item.preco_minimo) {
        if (!permitirAbaixoMinimo) {
          bloqueado = true;
        }
      }
      return { ...item, valor_unitario: Number(newPrice.toFixed(2)), subtotal: Number((newPrice * item.quantidade).toFixed(2)) };
    });

    if (bloqueado) {
      setDistribuicaoErro('Desconto bloqueado: Valor unitário ficaria abaixo do Mínimo permitido. Habilite a liberação se tiver autorização.');
      return;
    }

    setCurrentOrcamento(prev => ({ ...prev, itens: newItems }));
    setOrcamentoDesejado('');
  };

  const handleSalvar = async () => {
    if (!currentOrcamento.nome_cliente || !currentOrcamento.responsavel || (currentOrcamento.itens?.length || 0) === 0) {
      alert('Preencha o nome do cliente, responsável e adicione itens.');
      return;
    }
    
    try {
      await apiService.salvarOrcamento({
        ...currentOrcamento,
        total_orcamento: currentTotal
      });
      alert('Orçamento salvo com sucesso!');
      setViewState('list');
      carregarOrcamentos();
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    }
  };

  const handleExcluir = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este orçamento?')) {
      try {
        await apiService.excluirOrcamento(id);
        carregarOrcamentos();
      } catch (err: any) {
        alert('Erro: ' + err.message);
      }
    }
  };

  const formatCurrency = (v: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  };

  if (viewState === 'list') {
    const filtered = orcamentos.filter(o => !filtroResponsavel || o.responsavel === filtroResponsavel);

    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 mb-2">
              <Calculator className="h-4 w-4" />
              <span>Orçamentos</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Orçamentos Salvos</h1>
          </div>
          <button 
            onClick={() => {
              setCurrentOrcamento({ nome_cliente: '', responsavel: '', itens: [], total_orcamento: 0 });
              setViewState('edit');
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition"
          >
            <Plus className="h-5 w-5" />
            Novo Orçamento
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          <button 
            onClick={() => setFiltroResponsavel('')}
            className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-colors ${!filtroResponsavel ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
          >
            Todos
          </button>
          {RESPONSAVEIS.map(resp => (
            <button 
              key={resp}
              onClick={() => setFiltroResponsavel(resp)}
              className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-colors flex items-center gap-2 ${filtroResponsavel === resp ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
            >
              <User className="h-3 w-3" />
              {resp}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center p-8 text-slate-500 font-bold">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Calculator className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-bold">Nenhum orçamento encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(o => (
              <div key={o.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-black text-slate-900 dark:text-white line-clamp-1 text-lg">{o.nome_cliente}</h3>
                  <button onClick={() => o.id && handleExcluir(o.id)} className="text-slate-400 hover:text-red-500 p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1 mb-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                    <User className="h-3.5 w-3.5" /> Responsável: {o.responsavel}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Data: {o.criado_em ? new Date(o.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' }) : ''}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Itens: {o.itens.length} peça(s)
                  </p>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-bold text-slate-500">Total:</span>
                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(o.total_orcamento)}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => { setCurrentOrcamento(o); setViewState('edit'); }} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2 rounded-xl text-xs font-bold transition text-center">
                    Ver / Editar
                  </button>
                  <button onClick={() => { setCurrentOrcamento(o); setViewState('edit'); setTimeout(() => window.print(), 150); }} className="px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1" title="Imprimir Orçamento">
                    <Printer className="h-3.5 w-3.5" />
                    <span>Imprimir</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden orcamento-print-container">
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 print:hidden flex flex-col sm:flex-row justify-between gap-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-4">
          <button onClick={() => setViewState('list')} className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 transition">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Montar Orçamento</h2>
            <p className="text-xs text-slate-500">Simule preços e distribua descontos facilmente</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button onClick={handleSalvar} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 rounded-xl font-bold text-sm text-white hover:bg-indigo-700 transition">
            <Save className="h-4 w-4" />
            Salvar
          </button>
        </div>
      </div>

      <div className="hidden print:block p-8 border-b-2 border-slate-900 mb-6 text-center">
        <h1 className="text-3xl font-black mb-2">ORÇAMENTO</h1>
        <p className="text-lg font-bold text-slate-600">Cliente: {currentOrcamento.nome_cliente || '_________________________'}</p>
        <p className="text-sm font-bold text-slate-500 mt-1">Responsável: {currentOrcamento.responsavel}</p>
        <p className="text-sm text-slate-400 mt-1">Data: {new Date().toLocaleDateString('pt-BR')}</p>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:hidden">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nome de Identificação / Cliente</label>
            <input 
              type="text" 
              value={currentOrcamento.nome_cliente}
              onChange={e => setCurrentOrcamento(prev => ({...prev, nome_cliente: e.target.value}))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm font-bold text-slate-900 dark:text-white"
              placeholder="Ex: Oficina Mecânica Zé"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Responsável (Vendedor)</label>
            <select
              value={currentOrcamento.responsavel}
              onChange={e => setCurrentOrcamento(prev => ({...prev, responsavel: e.target.value}))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm font-bold text-slate-900 dark:text-white"
            >
              <option value="">Selecione...</option>
              {RESPONSAVEIS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 print:hidden relative">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Adicionar Mercadoria (Busca manual ou Câmera)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 p-2.5 text-sm font-bold text-slate-900 dark:text-white"
                placeholder="Buscar por descrição, part number ou EAN..."
              />
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                  {searchResults.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => addItem(p)}
                      className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                    >
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{p.descricao}</div>
                      <div className="text-xs text-slate-500 font-mono mt-1">Ref: {p.codigo_fabrica} | Sugerido: {formatCurrency(p.preco_sugerido || 0)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={onOpenQuickScan} className="bg-slate-800 dark:bg-slate-700 text-white p-2.5 rounded-xl hover:bg-slate-700 transition" title="Bipar com Câmera">
              <Calculator className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 print:border-none print:overflow-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 print:bg-transparent print:border-b-2 print:border-black">
                <th className="p-3 text-xs font-black text-slate-700 dark:text-slate-300 uppercase">Peça</th>
                <th className="p-3 text-xs font-black text-slate-700 dark:text-slate-300 uppercase print:hidden">Referências (Mín/Sug)</th>
                <th className="p-3 text-xs font-black text-slate-700 dark:text-slate-300 uppercase w-24 text-center">Qtd</th>
                <th className="p-3 text-xs font-black text-slate-700 dark:text-slate-300 uppercase w-32 text-right">V. Unit</th>
                <th className="p-3 text-xs font-black text-slate-700 dark:text-slate-300 uppercase w-32 text-right">Subtotal</th>
                <th className="p-3 w-10 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {(currentOrcamento.itens || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-bold text-sm print:hidden">Nenhuma peça adicionada ao orçamento.</td>
                </tr>
              ) : (
                (currentOrcamento.itens || []).map(item => (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 print:border-slate-300">
                    <td className="p-3">
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{item.descricao}</div>
                    </td>
                    <td className="p-3 print:hidden">
                      <div className="text-[10px] font-mono text-slate-500">Mín: {formatCurrency(item.preco_minimo || 0)}</div>
                      <div className="text-[10px] font-mono text-slate-500">Sug: {formatCurrency(item.preco_sugerido || 0)}</div>
                      <div className="text-[10px] font-mono text-slate-500">Tab: {formatCurrency(item.preco_tabela || 0)}</div>
                    </td>
                    <td className="p-3 text-center">
                      <input 
                        type="number" 
                        min="1"
                        value={item.quantidade}
                        onChange={e => updateItemQty(item.id, parseInt(e.target.value) || 1)}
                        className="w-16 p-1.5 text-center text-sm font-bold border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 print:border-none print:p-0 print:bg-transparent"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <input 
                        type="number"
                        step="0.01"
                        value={item.valor_unitario}
                        onChange={e => updateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                        className={`w-full p-1.5 text-right text-sm font-bold border rounded-lg bg-white dark:bg-slate-900 print:border-none print:p-0 print:bg-transparent ${item.preco_minimo && item.valor_unitario < item.preco_minimo ? 'border-rose-500 text-rose-600' : 'border-slate-300 dark:border-slate-700'}`}
                      />
                      {item.preco_minimo && item.valor_unitario < item.preco_minimo && (
                        <div className="text-[9px] text-rose-500 font-bold print:hidden leading-tight mt-1">Abaixo do mínimo!</div>
                      )}
                    </td>
                    <td className="p-3 text-right font-black text-slate-900 dark:text-white text-base">
                      {formatCurrency(item.subtotal)}
                    </td>
                    <td className="p-3 text-center print:hidden">
                      <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-end gap-6 bg-slate-50 dark:bg-slate-800/30 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 print:bg-transparent print:border-none print:p-0 mt-6">
          
          <div className="w-full sm:w-1/2 space-y-3 print:hidden">
            <h4 className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5">
              <Calculator className="h-4 w-4" /> Distribuição Automática de Desconto
            </h4>
            
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                <input 
                  type="number" 
                  step="0.01"
                  value={orcamentoDesejado}
                  onChange={e => setOrcamentoDesejado(e.target.value)}
                  placeholder="Total Desejado..."
                  className="w-full pl-9 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold focus:ring-2 focus:ring-indigo-500 dark:bg-slate-900"
                />
              </div>
              <button 
                onClick={handleDistribuirDesconto}
                className="bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-700 transition shadow"
              >
                Distribuir
              </button>
            </div>
            
            {distribuicaoErro && (
              <div className="text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl flex items-start gap-1.5 border border-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{distribuicaoErro}</p>
              </div>
            )}
            
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input 
                type="checkbox" 
                checked={permitirAbaixoMinimo}
                onChange={e => setPermitirAbaixoMinimo(e.target.checked)}
                className="rounded border-slate-300 text-rose-500 focus:ring-rose-500 w-4 h-4"
              />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                Autorizar desconto abaixo do Preço Mínimo
              </span>
            </label>
          </div>

          <div className="w-full sm:w-auto text-right print:w-full">
            <div className="text-sm font-bold text-slate-500 mb-1 uppercase tracking-wider">Total do Orçamento</div>
            <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(currentTotal)}
            </div>
            {(currentOrcamento.itens || []).length > 0 && (
              <div className="text-xs font-bold text-slate-400 mt-2 print:hidden">
                (Soma exata da lista acima)
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
