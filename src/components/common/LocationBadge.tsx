import React from 'react';
import { MapPin, AlertTriangle } from 'lucide-react';

interface LocationBadgeProps {
  corredor?: string;
  baia?: string;
  nivel?: string;
  locacao?: string;
  size?: 'compact' | 'large';
  className?: string;
}

export const LocationBadge: React.FC<LocationBadgeProps> = ({
  corredor,
  baia,
  nivel,
  locacao,
  size = 'compact',
  className = '',
}) => {
  const hasLocation = Boolean(corredor || baia || nivel || locacao);

  if (!hasLocation) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300 ${className}`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>SEM LOCALIZAÇÃO CADASTRADA</span>
      </div>
    );
  }

  if (size === 'large') {
    return (
      <div
        className={`overflow-hidden rounded-xl border-2 border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4 text-white shadow-md ${className}`}
      >
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
          <div className="flex items-center gap-2 text-indigo-300">
            <MapPin className="h-5 w-5 text-indigo-400" />
            <span className="text-xs font-black tracking-widest uppercase">Localização Física no Galpão</span>
          </div>
          {locacao && (
            <span className="font-mono text-sm font-bold tracking-wider rounded bg-indigo-500/20 px-2.5 py-0.5 text-indigo-200 border border-indigo-400/30">
              {locacao}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700">
            <span className="block text-[11px] font-semibold uppercase text-slate-400">Corredor</span>
            <span className="font-mono text-xl md:text-2xl font-black text-amber-400">{corredor || '—'}</span>
          </div>

          <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700">
            <span className="block text-[11px] font-semibold uppercase text-slate-400">Baia</span>
            <span className="font-mono text-xl md:text-2xl font-black text-emerald-400">{baia || '—'}</span>
          </div>

          <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700">
            <span className="block text-[11px] font-semibold uppercase text-slate-400">Nível</span>
            <span className="font-mono text-xl md:text-2xl font-black text-sky-400">{nivel || '—'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-2.5 py-1 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${className}`}
    >
      <MapPin className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
      {corredor && (
        <span>
          Corr: <strong className="font-semibold text-slate-900 dark:text-white">{corredor}</strong>
        </span>
      )}
      {baia && (
        <span>
          • Baia: <strong className="font-semibold text-slate-900 dark:text-white">{baia}</strong>
        </span>
      )}
      {nivel && (
        <span>
          • Nív: <strong className="font-semibold text-slate-900 dark:text-white">{nivel}</strong>
        </span>
      )}
      {locacao && (
        <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 ml-1">
          [{locacao}]
        </span>
      )}
    </div>
  );
};
