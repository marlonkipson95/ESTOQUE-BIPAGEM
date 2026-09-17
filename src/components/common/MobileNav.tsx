import React from 'react';
import {
  LayoutDashboard,
  Search,
  Barcode,
  PackageCheck,
  Boxes,
  UploadCloud,
  Settings,
  X,
  Users,
  LogOut,
  User,
  Calculator,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';
import { AppModule, SystemUser } from '../../types';

interface MobileNavProps {
  activeModule: AppModule;
  onSelectModule: (module: AppModule) => void;
  isDrawerOpen: boolean;
  onCloseDrawer: () => void;
  onOpenQuickScan: () => void;
  totalProductsCount: number;
  currentUser?: SystemUser | null;
  onLogout?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeModule,
  onSelectModule,
  isDrawerOpen,
  onCloseDrawer,
  onOpenQuickScan,
  totalProductsCount,
  currentUser,
  onLogout,
}) => {
  const bottomItems: { id: AppModule; label: string; icon: React.ElementType }[] = [
    { id: 'bipagem', label: 'Bipar', icon: Barcode },
    { id: 'consulta', label: 'Consultar', icon: Search },
    { id: 'anotacoes', label: 'Anotações', icon: ClipboardList },
    { id: 'orcamento', label: 'Orçamentos', icon: Calculator },
    { id: 'produtos', label: 'Produtos', icon: Boxes },
  ];

  const allModules: { id: AppModule; label: string; desc: string; icon: React.ElementType }[] = [
    { id: 'bipagem', label: 'Bipar / Localizar', desc: 'Identificar produto e ver prateleira física', icon: Barcode },
    { id: 'consulta', label: 'Consulta de Produtos', desc: 'Busca rápida e filtros avançados', icon: Search },
    { id: 'anotacoes', label: 'Anotações Rápidas', desc: 'Listas operacionais de contagem e conferência', icon: ClipboardList },
    { id: 'produtos', label: 'Catálogo de Produtos', desc: `${totalProductsCount} itens cadastrados`, icon: Boxes },
    { id: 'orcamento', label: 'Criar Orçamento', desc: 'Simular valores e distribuir descontos', icon: Calculator },
    { id: 'auditoria', label: 'Auditoria & Reversão', desc: 'Histórico de edições e reversão', icon: ShieldCheck },
    { id: 'dashboard', label: 'Painel Geral', desc: 'Resumo e alertas do galpão', icon: LayoutDashboard },
    { id: 'importacao', label: 'Importação CSV/JSON', desc: 'Carga de planilhas da empresa', icon: UploadCloud },
  ];

  if (currentUser?.cargo === 'Administrador') {
    allModules.push({ id: 'usuarios', label: 'Gerenciamento Usuários', desc: 'Operadores, senhas e permissões', icon: Users });
  }

  return (
    <>
      {/* Bottom Navigation Bar (Mobile Only, touch targets >= 44px) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-slate-200 bg-white/98 px-2 py-1 shadow-lg md:hidden dark:border-slate-800 dark:bg-slate-900/98">
        {bottomItems.map(item => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          const isBipagem = item.id === 'bipagem';

          return (
            <button
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl p-1 transition ${
                isBipagem
                  ? 'bg-indigo-600 text-white shadow-md font-bold px-3 py-1.5 -translate-y-1'
                  : isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Icon className={`h-5 w-5 ${isBipagem ? 'text-white' : ''}`} />
              <span className={`text-[10px] mt-0.5 ${isBipagem ? 'text-white' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Full Mobile Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onCloseDrawer}
          />

          {/* Drawer Content */}
          <div className="relative flex w-4/5 max-w-xs flex-1 flex-col bg-slate-900 text-white p-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <Barcode className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">KIPSTOCK</h3>
                  <p className="text-[10px] uppercase tracking-wider text-indigo-400">Gestão & Bipagem</p>
                </div>
              </div>
              <button
                onClick={onCloseDrawer}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Links List */}
            <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto">
              {allModules.map(module => {
                const Icon = module.icon;
                const isActive = activeModule === module.id;

                return (
                  <button
                    key={module.id}
                    onClick={() => {
                      onSelectModule(module.id);
                      onCloseDrawer();
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${
                      isActive
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <div>
                      <div className="text-sm">{module.label}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">{module.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Current user & logout in mobile drawer */}
            {currentUser && (
              <div className="border-t border-slate-800 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-indigo-400" />
                    <div>
                      <p className="text-xs font-bold text-white">{currentUser.nome}</p>
                      <p className="text-[10px] text-slate-400">@{currentUser.username}</p>
                    </div>
                  </div>
                  {onLogout && (
                    <button
                      onClick={() => {
                        onCloseDrawer();
                        onLogout();
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-400"
                      title="Sair"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Camera Scan Action */}
            <div className="border-t border-slate-800 pt-3">
              <button
                onClick={() => {
                  onCloseDrawer();
                  onOpenQuickScan();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 py-3 text-sm font-bold text-white shadow-md hover:opacity-95"
              >
                <Barcode className="h-4 w-4" />
                <span>Abrir Câmera para Bipar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
