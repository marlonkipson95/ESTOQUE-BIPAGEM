import React, { useState, useEffect } from 'react';
import {
  Menu,
  Barcode,
  Camera,
  Download,
  Wifi,
  WifiOff,
  Bell,
  User,
  LogOut,
  Shield,
  Database,
} from 'lucide-react';
import { AppModule, SystemUser } from '../../types';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { apiService } from '../../services/apiService';

interface HeaderProps {
  activeModule: AppModule;
  currentUser?: SystemUser | null;
  onLogout?: () => void;
  onOpenMobileMenu: () => void;
  onOpenQuickScan: () => void;
  unresolvedAlertsCount?: number;
  totalProducts?: number;
}

const MODULE_NAMES: Record<AppModule, { title: string; subtitle: string }> = {
  bipagem: { title: 'Bipagem & Identificação', subtitle: 'Identificação imediata do produto e da sua localização física' },
  consulta: { title: 'Consulta de Mercadorias', subtitle: 'Busca rápida por qualquer código, descrição ou locação' },
  produtos: { title: 'Produtos do Estoque', subtitle: 'Cadastro, estoque e catálogo de mercadorias' },
  dashboard: { title: 'Painel Operacional', subtitle: 'Situação geral do armazém e métricas' },
  importacao: { title: 'Importação de Planilha', subtitle: 'Carga via CSV/Excel da base existente da empresa' },
  usuarios: { title: 'Gerenciamento de Usuários', subtitle: 'Operadores, senhas e credenciais de acesso' },
  configuracoes: { title: 'Configurações do Sistema', subtitle: 'Parâmetros, Banco Neon PostgreSQL e preferências' },
};

export const Header: React.FC<HeaderProps> = ({
  activeModule,
  currentUser,
  onLogout,
  onOpenMobileMenu,
  onOpenQuickScan,
  unresolvedAlertsCount = 0,
  totalProducts = 0,
}) => {
  const isOnline = useOnlineStatus();
  const { isInstallable, install } = usePWAInstall();
  const info = MODULE_NAMES[activeModule] || { title: 'Kipson', subtitle: '' };
  const [dbStatus, setDbStatus] = useState<'connected' | 'checking' | 'disconnected'>('checking');

  useEffect(() => {
    let isMounted = true;
    const checkDb = () => {
      apiService.getHealth().then(res => {
        if (isMounted) {
          setDbStatus(res.database === 'connected' ? 'connected' : 'disconnected');
        }
      }).catch(() => {
        if (isMounted) setDbStatus('disconnected');
      });
    };
    checkDb();
    const interval = setInterval(checkDb, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 md:px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 md:hidden dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex flex-col">
          <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white leading-tight">
            {info.title}
          </h2>
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
            {info.subtitle}
          </span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Database Sync Status */}
        <div
          className={`hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${
            dbStatus === 'connected'
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300'
              : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
          }`}
          title={
            dbStatus === 'connected'
              ? `Banco de Dados PostgreSQL conectado! ${totalProducts} produto(s) salvos no servidor.`
              : 'Verificando conexão com o Banco de Dados central...'
          }
        >
          <Database className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="hidden md:inline">Banco Central:</span>
          <span>{dbStatus === 'connected' ? 'Salvo no DB' : 'Verificando...'}</span>
        </div>

        {/* Connectivity Status Pill */}
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isOnline
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
          }`}
          title={isOnline ? 'Conectado à rede' : 'Modo Offline: Usando armazenamento local'}
        >
          {isOnline ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              <span>Offline</span>
            </>
          )}
        </div>

        {/* User profile pill */}
        {currentUser && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
            <User className="h-3.5 w-3.5 text-indigo-500" />
            <span className="font-bold">{currentUser.username}</span>
          </div>
        )}

        {/* Logout button */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition"
            title="Sair do sistema (Logout)"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        )}

        {/* PWA Install Shortcut if available */}
        {isInstallable && (
          <button
            onClick={install}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Instalar App</span>
          </button>
        )}

        {/* Quick Camera Scanner Trigger */}
        <button
          onClick={onOpenQuickScan}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs md:text-sm font-semibold text-white shadow hover:bg-indigo-500 active:scale-95 transition"
          title="Abrir scanner de código de barras pela câmera"
        >
          <Camera className="h-4 w-4" />
          <span className="hidden sm:inline">Câmera</span>
        </button>
      </div>
    </header>
  );
};
