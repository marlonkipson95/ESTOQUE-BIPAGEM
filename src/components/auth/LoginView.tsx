import React, { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Boxes,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { beepService } from '../../services/beepService';
import { SystemUser } from '../../types';

interface LoginViewProps {
  onLoginSuccess: (user: SystemUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, informe o usuário e a senha.');
      beepService.playError();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await authService.login(username, password);
      if (res.success && res.user) {
        beepService.playSuccess();
        onLoginSuccess(res.user);
      } else {
        setError(res.error || 'Credenciais inválidas.');
        beepService.playError();
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado ao realizar login.');
      beepService.playError();
    } finally {
      setIsLoading(false);
    }
  };

  const fillDefaultCredentials = () => {
    setUsername('estoque');
    setPassword('controle12');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-sky-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand Card */}
        <div className="mb-6 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-white shadow-xl shadow-indigo-500/25 mb-3 ring-4 ring-indigo-500/20">
            <Boxes className="h-9 w-9" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
            KIPSON ESTOQUE
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Sistema Integrado de Armazém & Rastreamento
          </p>
        </div>

        {/* Login Box */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl p-7 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-400" />
                <span>Acesso ao Sistema</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Autenticação obrigatória para operadores
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Seguro</span>
            </span>
          </div>


          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/50 p-3.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Usuário
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Digite seu usuário (ex: estoque)"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-3 pl-10 pr-11 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span>Autenticando...</span>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-slate-400" />
              <span>Controle de Acesso Centralizado • Neon PostgreSQL</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Kipson Estoque • Versão 2.4 com Rastreamento Permanente de Bipagem
        </p>
      </div>
    </div>
  );
};
