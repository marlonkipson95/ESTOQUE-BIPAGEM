import React, { useState, useEffect, useRef } from 'react';
import { 
  ClipboardList, Plus, Search, Trash2, Printer, Save, 
  ChevronLeft, Check, AlertCircle, Camera, MapPin, Tag, 
  FileText, Calendar, Sparkles, RefreshCw, X
} from 'lucide-react';
import { QuickList, QuickListItem } from '../../types';
import { apiService } from '../../services/apiService';

interface AnotacoesViewProps {
  onOpenQuickScan: () => void;
  externalScannedCode?: string;
  onClearExternalScannedCode?: () => void;
}

const SUGESTOES_COMENTARIOS = [
  'Conferir estoque físico',
  'Cadastrar peça no sistema',
  'Caixa danificada',
  'Sem etiqueta de código',
  'Peça com avaria',
  'Apenas 1 un no estoque',
  'Apenas 2 un no estoque',
  'Sem localização física'
];

export const AnotacoesView: React.FC<AnotacoesViewProps> = ({
  onOpenQuickScan,
  externalScannedCode = '',
  onClearExternalScannedCode
}) => {
  const [viewState, setViewState] = useState<'list' | 'edit'>('list');
  const [listas, setListas] = useState<QuickList[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState('');

  // Lista atualmente aberta para edição
  const [currentLista, setCurrentLista] = useState<QuickList>({
    nome: '',
    responsavel: 'Estoque',
    itens: []
  });

  // Campos do formulário de novo item
  const [itemCodigo, setItemCodigo] = useState('');
  const [itemLocacao, setItemLocacao] = useState('');
  const [itemComentario, setItemComentario] = useState('');
  const [itemInfoLookup, setItemInfoLookup] = useState<{
    found: boolean;
    descricao?: string;
    locacao?: string;
    quantidade?: number;
  } | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const codigoInputRef = useRef<HTMLInputElement>(null);

  // Carregar listas ao montar
  useEffect(() => {
    carregarListas();
  }, []);

  const carregarListas = async () => {
    setLoading(true);
    try {
      const data = await apiService.getListasRapidas();
      setListas(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Efeito para receber código bipado externamente (via modal de câmera ou leitor)
  useEffect(() => {
    if (externalScannedCode && viewState === 'edit') {
      setItemCodigo(externalScannedCode);
      executarLookup(externalScannedCode);
      if (onClearExternalScannedCode) onClearExternalScannedCode();
    }
  }, [externalScannedCode, viewState]);

  // Executa busca rápida no banco local (sem Bluesoft Cosmos)
  const executarLookup = async (code: string) => {
    const clean = code.trim();
    if (!clean || clean.length < 2) {
      setItemInfoLookup(null);
      return;
    }
    setIsLookingUp(true);
    try {
      const info = await apiService.lookupItemRapido(clean);
      setItemInfoLookup(info);
      if (info.found && info.locacao && !itemLocacao) {
        setItemLocacao(info.locacao);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleCodigoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setItemCodigo(val);
    if (val.trim().length >= 3) {
      executarLookup(val);
    } else {
      setItemInfoLookup(null);
    }
  };

  const handleIniciarNovaLista = () => {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    setCurrentLista({
      nome: `Anotação ${dataAtual}`,
      responsavel: 'Estoque',
      itens: []
    });
    setItemCodigo('');
    setItemLocacao('');
    setItemComentario('');
    setItemInfoLookup(null);
    setViewState('edit');
    setTimeout(() => codigoInputRef.current?.focus(), 150);
  };

  const handleAbrirLista = (lista: QuickList) => {
    setCurrentLista({
      ...lista,
      itens: Array.isArray(lista.itens) ? [...lista.itens] : []
    });
    setItemCodigo('');
    setItemLocacao('');
    setItemComentario('');
    setItemInfoLookup(null);
    setViewState('edit');
  };

  const handleAdicionarItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCod = itemCodigo.trim();
    if (!cleanCod) return;

    const novoItem: QuickListItem = {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      codigo: cleanCod,
      locacao: itemLocacao.trim(),
      comentario: itemComentario.trim(),
      cadastrado: itemInfoLookup?.found ?? false,
      criado_em: new Date().toISOString()
    };

    setCurrentLista(prev => ({
      ...prev,
      itens: [novoItem, ...prev.itens]
    }));

    // Resetar campos de entrada e focar novamente
    setItemCodigo('');
    setItemLocacao('');
    setItemComentario('');
    setItemInfoLookup(null);
    codigoInputRef.current?.focus();
  };

  const handleRemoverItem = (itemId: string) => {
    setCurrentLista(prev => ({
      ...prev,
      itens: prev.itens.filter(i => i.id !== itemId)
    }));
  };

  const handleSalvarLista = async () => {
    if (!currentLista.nome.trim()) {
      alert('Por favor, informe um nome para a lista rápida.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiService.salvarListaRapida(currentLista);
      if (res.success && res.lista) {
        setCurrentLista(res.lista);
        setMensagemSucesso('Lista salva com sucesso no banco de dados!');
        setTimeout(() => setMensagemSucesso(''), 4000);
        carregarListas();
      } else {
        alert(res.error || 'Erro ao salvar lista.');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar lista.');
    } finally {
      setSaving(false);
    }
  };

  const handleExcluirLista = async (id?: number) => {
    if (!id) {
      setViewState('list');
      return;
    }
    if (!window.confirm(`Tem certeza que deseja excluir a Lista #${id} do banco de dados?`)) {
      return;
    }

    try {
      const res = await apiService.excluirListaRapida(id);
      if (res.success) {
        setViewState('list');
        carregarListas();
      } else {
        alert(res.error || 'Erro ao excluir lista.');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir lista.');
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  // ==========================================
  // RENDERIZAÇÃO: MODO LISTAGEM
  // ==========================================
  if (viewState === 'list') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <ClipboardList className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Anotações e Listas Rápidas
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Bipagem rápida, conferência física de estoque e anotações operacionais no galpão.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={carregarListas}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 border border-slate-700/80 hover:bg-slate-700 transition"
              title="Recarregar Listas"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              onClick={handleIniciarNovaLista}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition transform active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Nova Lista Rápida
            </button>
          </div>
        </div>

        {/* Lista de cards */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-sm">
            <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
            Carregando listas rápidas do banco de dados...
          </div>
        ) : listas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-slate-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-200">Nenhuma lista rápida criada ainda</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
              Crie uma lista para registrar códigos avulsos, conferir estoque, notar peças danificadas ou fazer contagens no galpão.
            </p>
            <button
              onClick={handleIniciarNovaLista}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition"
            >
              <Plus className="h-4 w-4" />
              Criar Primeira Lista
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listas.map(lista => (
              <div
                key={lista.id}
                className="group relative rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-sm hover:border-indigo-500/50 hover:bg-slate-800/40 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      #{lista.id}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {lista.criado_em ? new Date(lista.criado_em).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white mt-2.5 line-clamp-1 group-hover:text-indigo-300 transition">
                    {lista.nome}
                  </h3>

                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-300">
                      <Tag className="h-3.5 w-3.5 text-indigo-400" />
                      {lista.total_itens || (Array.isArray(lista.itens) ? lista.itens.length : 0)} itens
                    </span>
                    <span>•</span>
                    <span className="text-slate-400">
                      Resp: {lista.responsavel || 'Estoque'}
                    </span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleAbrirLista(lista)}
                    className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 hover:bg-indigo-600 hover:text-white transition text-center"
                  >
                    Abrir / Editar
                  </button>
                  <button
                    onClick={() => handleExcluirLista(lista.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition"
                    title="Excluir do banco"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // RENDERIZAÇÃO: MODO EDIÇÃO / ANOTAÇÃO
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewState('list')}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Voltar para todas as listas"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50">
                {currentLista.id ? `#${currentLista.id}` : 'Rascunho'}
              </span>
              <input
                type="text"
                value={currentLista.nome}
                onChange={e => setCurrentLista(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Nome da lista (ex: Contagem Setembro)"
                className="text-base font-bold text-white bg-transparent border-b border-dashed border-slate-700 focus:border-indigo-500 focus:outline-none px-1 py-0.5"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleImprimir}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </button>

          {currentLista.id && (
            <button
              onClick={() => handleExcluirLista(currentLista.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 bg-rose-950/30 border border-rose-800/40 hover:bg-rose-900/40 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </button>
          )}

          <button
            onClick={handleSalvarLista}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30 transition transform active:scale-95 disabled:opacity-60"
          >
            <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Gravando...' : 'Salvar Lista'}
          </button>
        </div>
      </div>

      {mensagemSucesso && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          {mensagemSucesso}
        </div>
      )}

      {/* Formulário de Adição Rápida */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Adicionar Item à Lista
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Não requer cadastro prévio • Zero uso de API externa
          </span>
        </div>

        <form onSubmit={handleAdicionarItem} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Campo Código */}
            <div className="sm:col-span-4 relative">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Código da Peça *
              </label>
              <div className="relative flex items-center">
                <input
                  ref={codigoInputRef}
                  type="text"
                  value={itemCodigo}
                  onChange={handleCodigoChange}
                  placeholder="Bipar ou digitar..."
                  className="w-full rounded-xl bg-slate-800/90 border border-slate-700 px-3 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-10"
                />
                <button
                  type="button"
                  onClick={onOpenQuickScan}
                  className="absolute right-2 p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-700/60 transition"
                  title="Abrir Leitor de Câmera"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>

              {/* Indicador de Lookup Rápido */}
              {isLookingUp ? (
                <span className="text-[10px] text-slate-400 mt-1 block flex items-center gap-1">
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Verificando banco...
                </span>
              ) : itemInfoLookup?.found ? (
                <span className="text-[10px] text-emerald-400 mt-1 block flex items-center gap-1 font-medium">
                  <Check className="h-3 w-3" /> Cadastrado: {itemInfoLookup.descricao || itemInfoLookup.codigo}
                </span>
              ) : itemCodigo.trim().length >= 3 ? (
                <span className="text-[10px] text-amber-400/80 mt-1 block">
                  ⚠️ Item novo / sem cadastro prévio
                </span>
              ) : null}
            </div>

            {/* Campo Locação */}
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-indigo-400" />
                Locação Física
              </label>
              <input
                type="text"
                value={itemLocacao}
                onChange={e => setItemLocacao(e.target.value)}
                placeholder="Ex: I-032-3 ou Corredor A"
                className="w-full rounded-xl bg-slate-800/90 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Campo Comentário */}
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Comentário (opcional)
              </label>
              <input
                type="text"
                value={itemComentario}
                onChange={e => setItemComentario(e.target.value)}
                placeholder="Ex: caixa danificada, 3 un..."
                className="w-full rounded-xl bg-slate-800/90 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Botão Adicionar */}
            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={!itemCodigo.trim()}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </div>

          {/* Chips de Sugestões Rápidas de Comentário */}
          <div className="pt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 mr-1 flex items-center gap-1 font-semibold">
              <Sparkles className="h-3 w-3 text-amber-400" /> Sugestões rápidas:
            </span>
            {SUGESTOES_COMENTARIOS.map((sugestao, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setItemComentario(sugestao)}
                className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/80 hover:bg-indigo-950/60 hover:text-indigo-300 hover:border-indigo-700/50 transition"
              >
                {sugestao}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Tabela de Itens da Lista */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Itens Registrados
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {currentLista.itens.length}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Itens mais recentes no topo
          </span>
        </div>

        {currentLista.itens.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Nenhum item adicionado a esta lista ainda. Bipe uma peça ou digite o código acima para começar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Locação</th>
                  <th className="px-4 py-3">Comentário / Observação</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 w-16 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {currentLista.itens.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">
                      {currentLista.itens.length - idx}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-white">
                      {item.codigo}
                    </td>
                    <td className="px-4 py-3">
                      {item.locacao ? (
                        <span className="inline-flex items-center gap-1 font-mono font-semibold text-slate-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                          <MapPin className="h-3 w-3 text-indigo-400" />
                          {item.locacao}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Sem locação</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {item.comentario || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.cadastrado ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                          <Check className="h-3 w-3" /> No Sistema
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                          Avulso / Novo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemoverItem(item.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                        title="Remover item da lista"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
