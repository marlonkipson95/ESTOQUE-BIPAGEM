import React from 'react';
import {
  LayoutDashboard,
  Search,
  Barcode,
  PackageCheck,
  Boxes,
  UploadCloud,
  Settings,
  ShieldCheck,
  MapPin,
  ChevronRight,
  Users,
  LogOut,
  User,
  Calculator,
} from 'lucide-react';
import { AppModule, SystemUser } from '../../types';

interface SidebarProps {
  activeModule: AppModule;
  onSelectModule: (module: AppModule) => void;
  totalProductsCount: number;
  currentUser?: SystemUser | null;
  onLogout?: () => void;
}

interface NavItem {
  id: AppModule;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
  highlight?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  totalProductsCount,
  currentUser,
  onLogout,
}) => {
  const navItems: NavItem[] = [
    { id: 'bipagem', label: 'Bipar / Localizar', icon: Barcode, highlight: true },
    { id: 'consulta', label: 'Consulta Estoque', icon: Search },
    { id: 'produtos', label: 'Produtos Cadastrados', icon: Boxes, badge: totalProductsCount },
    { id: 'orcamento', label: 'Orçamentos', icon: Calculator },
    { id: 'auditoria', label: 'Auditoria & Reversão', icon: ShieldCheck },
    { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
    { id: 'importacao', label: 'Importar Planilha', icon: UploadCloud },
  ];

  if (currentUser?.cargo === 'Administrador') {
    navItems.push({ id: 'usuarios', label: 'Usuários do Sistema', icon: Users });
  }

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 bg-slate-900 text-slate-300">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white shadow-md">
          <Barcode className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-black tracking-tight text-white text-lg leading-tight">
            KIPSTOCK
          </h1>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
            Gestão & Bipagem
          </span>
        </div>
      </div>

      {/* Quick Mission Statement reminder */}
      <div className="mx-4 mt-4 rounded-lg bg-slate-800/80 p-3 border border-slate-700/60 text-xs text-slate-300">
        <div className="flex items-center gap-1.5 font-semibold text-amber-300">
          <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>Foco Operacional</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400 leading-tight">
          Bipar / Consultar → Identificar → Localizar com precisão física.
        </p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              } ${item.highlight && !isActive ? 'ring-1 ring-indigo-500/40' : ''}`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`h-5 w-5 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white' : item.highlight ? 'text-indigo-400' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
                  }`}
                >
                  {item.badge}
                </span>
              ) : (
                isActive && <ChevronRight className="h-4 w-4 text-white/80" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Current Logged In User Box */}
      {currentUser && (
        <div className="border-t border-slate-800 p-3 bg-slate-950/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{currentUser.nome}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">@{currentUser.username}</p>
              </div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                title="Sair do sistema"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="border-t border-slate-800 p-4 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>ID Estável & Neon PG</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">v2.4 PWA</span>
      </div>
    </aside>
  );
};
