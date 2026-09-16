import React, { useState } from 'react';
import { Download, Share, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isInstalled || dismissed) return null;

  if (isInstallable) {
    return (
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white px-4 py-2 text-xs flex items-center justify-between border-b border-indigo-700/40">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-medium">
            Instale o <strong>KipStock</strong> no seu dispositivo para acesso offline e scanner ultra-rápido.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={install}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 hover:bg-indigo-400 px-3 py-1 font-semibold text-white shadow-sm transition"
          >
            <Download className="h-3.5 w-3.5" /> Instalar PWA
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-slate-400 hover:text-white"
            title="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (isIOS) {
    return (
      <>
        <div className="bg-slate-900 text-white px-4 py-2 text-xs flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Share className="h-3.5 w-3.5 text-indigo-400" />
            <span>Instale o aplicativo na sua tela de início do iOS.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowIOSModal(true)}
              className="rounded-md bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 font-semibold text-white transition"
            >
              Como Instalar
            </button>
            <button onClick={() => setDismissed(true)} className="p-1 text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="font-bold text-base">Instalar no iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                    1
                  </div>
                  <p>
                    No navegador Safari, toque no botão <strong>Compartilhar</strong> (ícone do quadrado com seta para cima).
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                    2
                  </div>
                  <p>
                    Role a lista para baixo e selecione <strong>Adicionar à Tela de Início</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                    3
                  </div>
                  <p>
                    Toque em <strong>Adicionar</strong> no canto superior direito para abrir como aplicativo nativo.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
