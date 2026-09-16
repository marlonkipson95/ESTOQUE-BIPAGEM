import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  RotateCcw,
  Search,
  RefreshCw,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  Filter,
  FileText,
  Boxes,
  ArrowRight,
} from 'lucide-react';
import { AuditoriaRecord } from '../../types';
import { apiService } from '../../services/apiService';

interface AuditoriaViewProps {
  onSelectProduct?: (productId: string) => void;
}

export const AuditoriaView: React.FC<AuditoriaViewProps> = () => {
  const [records, setRecords] = useState<AuditoriaRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedField, setSelectedField] = useState('todos');
  const [revertingId, setRevertingId] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<AuditoriaRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAuditoria = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiService.getAuditoria(searchTerm);
      setRecords(data);
    } catch (err: any) {
      console.error('Erro ao carregar auditoria:', err);
      setStatusMessage({ type: 'error', text: 'Falha ao carregar registros de auditoria.' });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    loadAuditoria();
  }, [loadAuditoria]);

  const handleReverter = async (record: AuditoriaRecord) => {
    setRevertingId(record.id);
    try {
      const res = await apiService.reverterAuditoria(record.id);
      setStatusMessage({ type: 'success', text: res.message || 'Alteração revertida com sucesso!' });
      setConfirmModal(null);
      await loadAuditoria();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Não foi possível reverter a alteração.' });
    } finally {
      setRevertingId(null);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const filteredRecords = records.filter(r => {
    if (selectedField !== 'todos' && r.campo !== selectedField) return false;
    return true;
  });

  const getCampoLabel = (campo: string) => {
    switch (campo) {
      case 'localizacao': return 'Endereço / Localização';
      case 'descricao': return 'Descrição do Produto';
      case 'codigo_barras_atual': return 'Código de Barras (EAN)';
      case 'codigo_atual': return 'Código Interno';
      case 'codigo_fabrica': return 'Código de Fábrica';
      case 'preco_tabela': return 'Preço Tabela';
      case 'preco_sugerido': return 'Preço Sugerido';
      case 'preco_minimo': return 'Preço Mínimo';
      case 'quantidade': return 'Quantidade Estoque';
      case 'criacao': return 'Cadastro Inicial';
      default: return campo;
    }
  };

  const formatValor = (val: string | null) => {
    if (!val) return <span className="text-slate-500 italic">Vazio / Não definido</span>;
    try {
      if (val.startsWith('{') && val.endsWith('}')) {
        const obj = JSON.parse(val);
        if (obj.locacao) return <span className="font-mono">{obj.locacao}</span>;
      }
    } catch {}
    return <span className="font-medium">{val}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Auditoria & Rastreabilidade
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Livro de registro técnico permanente. Visualize histórico de edições e reverta alterações indevidas.
          </p>
        </div>

        <button
          onClick={loadAuditoria}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition border border-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          Atualizar Registro
        </button>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`flex items-center gap-3 rounded-xl p-4 border text-sm font-medium animate-in fade-in duration-200 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Pesquisar por código, produto, operador ou motivo..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={selectedField}
            onChange={e => setSelectedField(e.target.value)}
            className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="todos">Todos os Campos</option>
            <option value="localizacao">Endereço / Localização</option>
            <option value="descricao">Descrição</option>
            <option value="codigo_barras_atual">Código de Barras</option>
            <option value="codigo_atual">Código Interno</option>
            <option value="preco_tabela">Preço</option>
            <option value="quantidade">Quantidade Estoque</option>
          </select>
        </div>
      </div>

      {/* Records Table / List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Linha do Tempo de Alterações ({filteredRecords.length} registros)
          </span>
          <span className="text-xs text-indigo-400 font-medium flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Rastreabilidade Ativa no PostgreSQL
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-indigo-500 mb-3" />
            <p className="text-sm">Carregando livro de registro e rastreabilidade...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="h-10 w-10 mx-auto text-slate-600 mb-3" />
            <p className="text-base font-semibold text-slate-300">Nenhum registro encontrado</p>
            <p className="text-xs text-slate-500 mt-1">
              As alterações cadastrais ou de localização feitas no sistema são gravadas automaticamente aqui para rastreabilidade.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredRecords.map(rec => {
              const canRevert = rec.valor_anterior !== null && rec.valor_anterior !== undefined && rec.campo !== 'criacao';

              return (
                <div key={rec.id} className="p-5 hover:bg-slate-800/30 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* Header Info */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 px-2.5 py-0.5 rounded-md">
                        {rec.codigo_atual || rec.produto_id}
                      </span>
                      <span className="font-semibold text-slate-200">
                        {rec.descricao || 'Produto Identificado'}
                      </span>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-slate-400 font-medium">
                        Campo: <strong className="text-slate-200">{getCampoLabel(rec.campo)}</strong>
                      </span>
                    </div>

                    {/* Diff: Before vs After */}
                    <div className="flex flex-wrap items-center gap-2 text-sm bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                      <div className="flex items-center gap-1.5 text-rose-300/90 line-through bg-rose-950/30 px-2 py-1 rounded-md border border-rose-900/40">
                        <span className="text-[10px] uppercase font-bold text-rose-400">Antes:</span>
                        {formatValor(rec.valor_anterior)}
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />

                      <div className="flex items-center gap-1.5 text-emerald-300 bg-emerald-950/30 px-2 py-1 rounded-md border border-emerald-900/40 font-medium">
                        <span className="text-[10px] uppercase font-bold text-emerald-400">Agora:</span>
                        {formatValor(rec.valor_novo)}
                      </div>
                    </div>

                    {/* Metadata: User, Date, Reason */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-slate-500" />
                        {rec.usuario || 'Operador'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                        {new Date(rec.criado_em).toLocaleString('pt-BR')}
                      </span>
                      {rec.motivo && (
                        <span className="text-slate-400 italic">
                          Motivo: {rec.motivo}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {canRevert ? (
                      <button
                        onClick={() => setConfirmModal(rec)}
                        disabled={revertingId === rec.id}
                        className="flex items-center gap-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3.5 py-2 text-xs font-semibold transition shadow-sm hover:border-amber-500/50 cursor-pointer"
                        title="Restaura o valor que estava cadastrado antes dessa alteração"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reverter Alteração
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-600 italic px-2 py-1">
                        Sem reversão anterior
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Rollback */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Confirmar Reversão</h3>
                <p className="text-xs text-slate-400">Restaurar valor anterior no banco de dados</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-950 p-3.5 border border-slate-800 space-y-2 text-xs">
              <p className="text-slate-300">
                Você está prestes a reverter o campo <strong className="text-white">{getCampoLabel(confirmModal.campo)}</strong> do produto:
              </p>
              <p className="font-semibold text-indigo-400">{confirmModal.codigo_atual} - {confirmModal.descricao}</p>
              
              <div className="pt-2 border-t border-slate-800 space-y-1">
                <p className="text-rose-400">Valor atual: <span className="text-white">{confirmModal.valor_novo}</span></p>
                <p className="text-emerald-400 font-bold">Será restaurado para: <span className="text-white">{confirmModal.valor_anterior}</span></p>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Essa operação restaura o valor no produto imediatamente e registra um novo log de rastreabilidade informando a reversão.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleReverter(confirmModal)}
                disabled={revertingId === confirmModal.id}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs font-bold transition shadow-md disabled:opacity-50"
              >
                {revertingId === confirmModal.id ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Sim, Reverter Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
