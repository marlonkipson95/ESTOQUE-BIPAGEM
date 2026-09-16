import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Volume2,
  RotateCcw,
  CheckCircle2,
  Download,
  Upload,
  Server,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { apiService } from '../../services/apiService';
import { beepService } from '../../services/beepService';

interface ConfiguracoesViewProps {
  onDatabaseReset: () => void;
}

export const ConfiguracoesView: React.FC<ConfiguracoesViewProps> = ({ onDatabaseReset }) => {
  const [testingDb, setTestingDb] = useState(false);
  const [dbStatus, setDbStatus] = useState<{
    tested: boolean;
    connected: boolean;
    provider: string;
    message: string;
    timestamp?: string;
  }>({
    tested: false,
    connected: false,
    provider: 'neon-postgresql',
    message: 'Aguardando verificação...',
  });

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Check database health on initial load
  useEffect(() => {
    checkConnection(false);
  }, []);

  const checkConnection = async (playSound = true) => {
    setTestingDb(true);
    try {
      const health = await apiService.getHealth();
      const isConnected = health.database === 'connected';
      setDbStatus({
        tested: true,
        connected: isConnected,
        provider: health.provider || 'neon-postgresql',
        message: isConnected
          ? 'Conexão ativa com o banco PostgreSQL no Neon. As transações são persistidas em nuvem.'
          : 'Modo local de contingência ativo. Para persistência remota no Neon, defina a variável DATABASE_URL.',
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      });
      if (playSound) {
        if (isConnected) beepService.playSuccess();
        else beepService.playWarning();
      }
    } catch (err: any) {
      setDbStatus({
        tested: true,
        connected: false,
        provider: 'offline',
        message: `Não foi possível contatar a API: ${err.message}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      });
      if (playSound) beepService.playError();
    } finally {
      setTestingDb(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await storageService.syncWithBackend();
      if (res.synced) {
        setSyncResult(`Sincronização concluída com sucesso! ${res.count} produtos sincronizados.`);
        beepService.playSuccess();
        onDatabaseReset();
      } else {
        setSyncResult('Dados locais e em cache já estão alinhados com o estado do servidor.');
        beepService.playSuccess();
      }
    } catch (err: any) {
      setSyncResult(`Aviso de sincronização: ${err.message}`);
      beepService.playWarning();
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  const handleTestBeep = () => {
    beepService.playSuccess();
  };

  const handleTestWarning = () => {
    beepService.playWarning();
  };

  const handleExportJSON = () => {
    const data = storageService.exportFullDatabaseJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kipstock_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    beepService.playSuccess();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const content = evt.target?.result as string;
      if (content) {
        const success = storageService.importFullDatabaseJSON(content);
        if (success) {
          beepService.playSuccess();
          alert('Backup restaurado com sucesso!');
          onDatabaseReset();
        } else {
          beepService.playError();
          alert('Erro ao importar backup: arquivo inválido.');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleResetToDemo = () => {
    if (
      confirm(
        'Tem certeza que deseja restaurar os dados de demonstração iniciais? As alterações locais serão substituídas pelos produtos de teste.'
      )
    ) {
      storageService.resetToInitialData();
      beepService.playSuccess();
      onDatabaseReset();
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16 text-xs">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              Configurações do Sistema
            </h1>
            <p className="text-xs text-slate-500">
              Banco Neon PostgreSQL, leitor de código de barras, avisos sonoros e backups
            </p>
          </div>
        </div>
      </div>

      {/* Neon PostgreSQL Integration Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Banco de Dados PostgreSQL (Neon)
                </h2>
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  Neon Serverless
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Persistência relacional de produtos, histórico permanente de códigos e auditoria física
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                dbStatus.connected
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-500'
              }`}
            />
            <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300">
              {dbStatus.connected ? 'Neon Conectado' : 'Contingência Ativa'}
            </span>
          </div>
        </div>

        {/* Status Message Box */}
        <div
          className={`rounded-xl border p-4 ${
            dbStatus.connected
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
          }`}
        >
          <div className="flex items-start gap-3">
            {dbStatus.connected ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <Cpu className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            )}
            <div className="space-y-1">
              <div className="font-bold text-xs">
                {dbStatus.connected
                  ? 'Banco Neon PostgreSQL Ativo e Operacional'
                  : 'Motor Local em Cache & Contingência'}
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">{dbStatus.message}</p>
              {dbStatus.timestamp && (
                <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                  Última verificação: {dbStatus.timestamp} • Provedor: {dbStatus.provider}
                </div>
              )}
            </div>
          </div>
        </div>

        {syncResult && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="font-bold text-xs">{syncResult}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={testingDb}
            onClick={() => checkConnection(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
          >
            <RefreshCw className={`h-4 w-4 text-indigo-600 ${testingDb ? 'animate-spin' : ''}`} />
            <span>{testingDb ? 'Testando Conexão...' : 'Testar Conexão com Neon'}</span>
          </button>

          <button
            type="button"
            disabled={syncing}
            onClick={handleManualSync}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white shadow hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            <Database className="h-4 w-4" />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar Dados Agora'}</span>
          </button>
        </div>

        {/* Architectural Guidelines Card */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 space-y-2">
          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
            <AlertCircle className="h-4 w-4 text-indigo-500" />
            <span>Parâmetros e Regras do Banco de Dados:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>
              <strong>Variável de Conexão:</strong> Definida via <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">DATABASE_URL</code> com string do Neon PostgreSQL.
            </li>
            <li>
              <strong>Estrutura Automática:</strong> As tabelas <code className="font-mono text-indigo-600 dark:text-indigo-400">produtos</code>, <code className="font-mono text-indigo-600 dark:text-indigo-400">codigos_produto</code>, <code className="font-mono text-indigo-600 dark:text-indigo-400">historico_alteracoes</code> e <code className="font-mono text-indigo-600 dark:text-indigo-400">movimentacoes</code> são geradas automaticamente na primeira conexão.
            </li>
            <li>
              <strong>Integridade de Localização:</strong> Atualizar corredor, baia ou nível nunca apaga ou altera códigos, descrições ou históricos.
            </li>
          </ul>
        </div>
      </div>

      {/* Áudio e Feedback Operacional */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
          <Volume2 className="h-5 w-5 text-indigo-600" />
          <span>Feedback Sonoro e Háptico</span>
        </div>

        <p className="text-slate-500">
          Gera avisos sonoros instantâneos via Web Audio API em computadores e coletores para confirmação rápida sem olhar para a tela.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTestBeep}
            className="rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            Testar Som: Sucesso (Verde)
          </button>
          <button
            onClick={handleTestWarning}
            className="rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
          >
            Testar Som: Atenção / Código Antigo
          </button>
        </div>
      </div>

      {/* Backup & Dados Locais */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
          <Database className="h-5 w-5 text-indigo-600" />
          <span>Gestão da Base de Dados Local e Contingência</span>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportJSON}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 font-bold"
          >
            <Download className="h-4 w-4" />
            <span>Exportar Backup Completo (JSON)</span>
          </button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Upload className="h-4 w-4" />
            <span>Restaurar Backup</span>
            <input type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
          </label>

          <button
            onClick={handleResetToDemo}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 px-4 py-2 font-bold ml-auto"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Restaurar Catálogo Demo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
