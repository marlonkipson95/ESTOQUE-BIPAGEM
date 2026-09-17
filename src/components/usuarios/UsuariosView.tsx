import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  X,
  Lock,
  UserCheck,
} from 'lucide-react';
import { SystemUser } from '../../types';
import { authService } from '../../services/authService';
import { beepService } from '../../services/beepService';

export const UsuariosView: React.FC = () => {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const currentUser = authService.getSession().user;

  if (currentUser?.cargo !== 'Administrador') {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-slate-500">
        <Shield className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold">Acesso Negado</h2>
        <p>Apenas Administradores podem gerenciar usuários do sistema.</p>
      </div>
    );
  }

  // Modals state
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    nome: '',
    username: '',
    password: '',
    cargo: 'Operador Almoxarifado',
    ativo: true,
  });

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await authService.getUsers();
      setUsers(list);
    } catch (err: any) {
      setError('Não foi possível carregar a lista de usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !formData.username.trim() || !formData.password.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      beepService.playError();
      return;
    }

    try {
      const res = await authService.createUser({
        nome: formData.nome.trim(),
        username: formData.username.trim().toLowerCase(),
        password: formData.password.trim(),
        cargo: formData.cargo.trim(),
      });

      if (res.success) {
        beepService.playSuccess();
        setSuccessMsg(`Usuário "${formData.username}" cadastrado com sucesso!`);
        setIsNewUserModalOpen(false);
        setFormData({
          nome: '',
          username: '',
          password: '',
          cargo: 'Operador Almoxarifado',
          ativo: true,
        });
        loadUsers();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.error || 'Erro ao cadastrar usuário.');
        beepService.playError();
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado');
      beepService.playError();
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const res = await authService.updateUser(editingUser.id, {
        nome: formData.nome.trim(),
        cargo: formData.cargo.trim(),
        ativo: formData.ativo,
        ...(formData.password.trim() ? { password: formData.password.trim() } : {}),
      });

      if (res.success) {
        beepService.playSuccess();
        setSuccessMsg(`Usuário "${editingUser.username}" atualizado com sucesso!`);
        setEditingUser(null);
        loadUsers();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.error || 'Erro ao atualizar usuário.');
        beepService.playError();
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado');
      beepService.playError();
    }
  };

  const handleDeleteUser = async (user: SystemUser) => {
    if (user.username.toLowerCase() === 'estoque') {
      setError('O usuário mestre "estoque" não pode ser excluído.');
      beepService.playError();
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o usuário "${user.username}"?`)) {
      return;
    }

    try {
      const res = await authService.deleteUser(user.id);
      if (res.success) {
        beepService.playSuccess();
        setSuccessMsg(`Usuário "${user.username}" excluído.`);
        loadUsers();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.error || 'Erro ao excluir usuário.');
        beepService.playError();
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir usuário.');
      beepService.playError();
    }
  };

  const openEditModal = (user: SystemUser) => {
    setEditingUser(user);
    setFormData({
      nome: user.nome,
      username: user.username,
      password: '',
      cargo: user.cargo,
      ativo: user.ativo,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
            <span>Gerenciamento de Usuários</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Controle de credenciais e permissões para acesso ao sistema
          </p>
        </div>

        <button
          onClick={() => {
            setFormData({
              nome: '',
              username: '',
              password: '',
              cargo: 'Operador Almoxarifado',
              ativo: true,
            });
            setIsNewUserModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs md:text-sm font-bold text-white shadow-md hover:bg-indigo-500 transition"
        >
          <UserPlus className="h-4 w-4" />
          <span>Cadastrar Novo Usuário</span>
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-50 p-4 text-xs font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Credential summary box */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-bold text-indigo-950 dark:text-indigo-200">
              Usuário Principal do Sistema
            </h4>
            <p className="text-indigo-900/80 dark:text-indigo-300/80 mt-0.5">
              O operador principal está configurado como <strong className="font-mono text-indigo-950 dark:text-white">estoque</strong> com a senha padrão <strong className="font-mono text-indigo-950 dark:text-white">controle12</strong>. Em qualquer dispositivo que acessar o sistema, essas credenciais são solicitadas na tela de login.
            </p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">
            Usuários Cadastrados ({users.length})
          </h3>
          <span className="text-xs text-slate-500">
            Autenticação integrada com PostgreSQL
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Carregando usuários do sistema...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Nome do Operador</th>
                  <th className="py-3 px-4">Login / Usuário</th>
                  <th className="py-3 px-4">Cargo / Função</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Último Acesso</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map(u => {
                  const isMaster = u.username.toLowerCase() === 'estoque';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span>{u.nome}</span>
                          {isMaster && (
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              PADRÃO
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {u.username}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 font-medium">
                        {u.cargo}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            u.ativo
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${u.ativo ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {u.ultimo_login ? new Date(u.ultimo_login).toLocaleString('pt-BR') : 'Nunca acessou'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(u)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition"
                            title="Editar usuário / alterar senha"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {!isMaster && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition"
                              title="Excluir usuário"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: NOVO USUÁRIO */}
      {isNewUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-indigo-600" />
                <span>Cadastrar Novo Usuário</span>
              </h3>
              <button
                onClick={() => setIsNewUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Carlos Eduardo"
                  required
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome de Usuário (Login) *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                  placeholder="Ex: carlos.estoque"
                  required
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Senha *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Digite a senha de acesso"
                  required
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Cargo / Função
                </label>
                <select
                  value={formData.cargo}
                  onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Operador Almoxarifado">Operador Almoxarifado</option>
                  <option value="Conferente de Carga">Conferente de Carga</option>
                  <option value="Gerente de Estoque">Gerente de Estoque</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewUserModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow"
                >
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR USUÁRIO / ALTERAR SENHA */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-indigo-600" />
                <span>Editar Usuário: {editingUser.username}</span>
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  required
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Cargo / Função
                </label>
                <select
                  value={formData.cargo}
                  onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Operador Almoxarifado">Operador Almoxarifado</option>
                  <option value="Conferente de Carga">Conferente de Carga</option>
                  <option value="Gerente de Estoque">Gerente de Estoque</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Nova Senha (deixe em branco para manter a atual)</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Digite nova senha para alterar"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user-ativo"
                  checked={formData.ativo}
                  onChange={e => setFormData({ ...formData, ativo: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="user-ativo" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Usuário Ativo (pode acessar o sistema)
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow"
                >
                  Atualizar Dados
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
