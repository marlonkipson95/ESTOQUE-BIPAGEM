import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Erro capturado na interface:', error, errorInfo);
  }

  private handleHardReload = async () => {
    try {
      // Desregistra Service Workers antigos presos em cache
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      // Limpa os caches do Cache Storage do navegador
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }
    } catch (e) {
      console.warn('[ErrorBoundary] Falha ao limpar caches:', e);
    } finally {
      // Força recarregamento limpo a partir do servidor
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/30">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-black text-white">
              Nova versão disponível ou cache antigo detectado
            </h2>

            <p className="text-xs text-slate-300 leading-relaxed">
              O sistema identificou uma atualização recente. Clique no botão abaixo para limpar o cache da versão anterior e carregar a aplicação atualizada.
            </p>

            {this.state.error && (
              <div className="bg-slate-950 p-3 rounded-xl text-left border border-slate-800 text-[11px] font-mono text-rose-300 break-all max-h-28 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <button
              onClick={this.handleHardReload}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3 px-4 text-sm font-bold text-white shadow-lg transition active:scale-95"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Atualizar & Carregar Sistema</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
