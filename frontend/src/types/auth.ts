export interface UserProfile {
  id: string;
  nombre: string;
  email: string;
  rol: 'administrador' | 'cajero';
  activo: boolean;
}

export interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
}
