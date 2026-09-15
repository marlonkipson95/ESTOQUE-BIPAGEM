import { SystemUser, AuthSession } from '../types';

const STORAGE_SESSION_KEY = 'kipson_auth_session';
const STORAGE_USERS_KEY = 'kipson_cached_users';

const DEFAULT_USERS: SystemUser[] = [
  {
    id: 1,
    username: 'estoque',
    nome: 'Operador Almoxarifado',
    cargo: 'Administrador',
    ativo: true,
    criado_em: new Date().toISOString(),
  },
];

class AuthService {
  private currentSession: AuthSession | null = null;

  constructor() {
    this.loadSessionFromStorage();
  }

  private loadSessionFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.isAuthenticated && parsed.user) {
          this.currentSession = parsed;
        }
      }
    } catch (e) {
      console.error('[Auth] Erro ao carregar sessão local:', e);
      this.currentSession = null;
    }
  }

  getSession(): AuthSession {
    if (this.currentSession && this.currentSession.isAuthenticated) {
      return this.currentSession;
    }
    return {
      isAuthenticated: false,
      user: null,
    };
  }

  async login(username: string, password: string): Promise<{ success: boolean; user?: SystemUser; error?: string }> {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass }),
      });

      if (res.ok) {
        const data = await res.json();
        const session: AuthSession = {
          isAuthenticated: true,
          user: data.user,
          token: data.token,
        };
        this.currentSession = session;
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
        return { success: true, user: data.user };
      }

      if (res.status === 401) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || 'Usuário ou senha incorretos' };
      }
    } catch (err: any) {
      console.warn('[Auth] Backend indisponível, validando credenciais localmente:', err.message);
    }

    // Fallback local authentication
    if (cleanUser === 'estoque' && cleanPass === 'controle12') {
      const defaultUser: SystemUser = {
        id: 1,
        username: 'estoque',
        nome: 'Operador Almoxarifado',
        cargo: 'Administrador',
        ativo: true,
        criado_em: new Date().toISOString(),
        ultimo_login: new Date().toISOString(),
      };

      const session: AuthSession = {
        isAuthenticated: true,
        user: defaultUser,
        token: `local_token_${Date.now()}`,
      };

      this.currentSession = session;
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
      return { success: true, user: defaultUser };
    }

    // Check custom users in localStorage
    try {
      const storedUsersRaw = localStorage.getItem(STORAGE_USERS_KEY);
      if (storedUsersRaw) {
        const localUsers: (SystemUser & { password?: string })[] = JSON.parse(storedUsersRaw);
        const match = localUsers.find(
          u => u.username.toLowerCase() === cleanUser && u.password === cleanPass && u.ativo
        );
        if (match) {
          const { password: _, ...safeUser } = match;
          const session: AuthSession = {
            isAuthenticated: true,
            user: safeUser,
            token: `local_token_${match.id}_${Date.now()}`,
          };
          this.currentSession = session;
          localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
          return { success: true, user: safeUser };
        }
      }
    } catch (e) {
      console.error('[Auth] Erro ao verificar usuários locais:', e);
    }

    return {
      success: false,
      error: 'Credenciais inválidas. Para acesso utilize usuário "estoque" e senha "controle12".',
    };
  }

  logout(): void {
    this.currentSession = null;
    localStorage.removeItem(STORAGE_SESSION_KEY);
  }

  async getUsers(): Promise<SystemUser[]> {
    try {
      const res = await fetch('/api/usuarios');
      if (res.ok) {
        const data = await res.json();
        if (data.users && Array.isArray(data.users)) {
          localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(data.users));
          return data.users;
        }
      }
    } catch (err: any) {
      console.warn('[Auth] Erro ao obter usuários da API, usando cache local:', err.message);
    }

    try {
      const stored = localStorage.getItem(STORAGE_USERS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }

    return DEFAULT_USERS;
  }

  async createUser(user: {
    username: string;
    password?: string;
    nome: string;
    cargo: string;
  }): Promise<{ success: boolean; user?: SystemUser; error?: string }> {
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });

      if (res.ok) {
        const data = await res.json();
        return { success: true, user: data.user };
      }

      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'Falha ao cadastrar usuário' };
    } catch (err: any) {
      // Local fallback
      const current = await this.getUsers();
      if (current.some(u => u.username.toLowerCase() === user.username.toLowerCase().trim())) {
        return { success: false, error: 'Este nome de usuário já está em uso.' };
      }

      const newUser: SystemUser & { password?: string } = {
        id: Date.now(),
        username: user.username.trim().toLowerCase(),
        password: user.password?.trim() || '123456',
        nome: user.nome.trim(),
        cargo: user.cargo.trim(),
        ativo: true,
        criado_em: new Date().toISOString(),
      };

      const updated = [...current, newUser];
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(updated));
      return { success: true, user: newUser };
    }
  }

  async updateUser(
    id: number | string,
    data: { nome?: string; cargo?: string; password?: string; ativo?: boolean }
  ): Promise<{ success: boolean; user?: SystemUser; error?: string }> {
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const resData = await res.json();
        return { success: true, user: resData.user };
      }

      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'Falha ao atualizar usuário' };
    } catch (err: any) {
      const current = await this.getUsers();
      const idx = current.findIndex(u => String(u.id) === String(id));
      if (idx !== -1) {
        current[idx] = { ...current[idx], ...data };
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(current));
        return { success: true, user: current[idx] };
      }
      return { success: false, error: 'Usuário não encontrado' };
    }
  }

  async deleteUser(id: number | string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        return { success: true };
      }

      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'Falha ao excluir usuário' };
    } catch (err: any) {
      const current = await this.getUsers();
      const user = current.find(u => String(u.id) === String(id));
      if (user && user.username.toLowerCase() === 'estoque') {
        return { success: false, error: 'O usuário mestre "estoque" não pode ser excluído.' };
      }

      const filtered = current.filter(u => String(u.id) !== String(id));
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(filtered));
      return { success: true };
    }
  }
}

export const authService = new AuthService();
