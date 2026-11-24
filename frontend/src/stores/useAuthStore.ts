import { create } from 'zustand';
import { UserProfile } from '../types/auth';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const savedToken = localStorage.getItem('buenvecino_token');
  const savedUser = localStorage.getItem('buenvecino_user');

  return {
    token: savedToken,
    user: savedUser ? JSON.parse(savedUser) : null,
    isAuthenticated: !!savedToken,
    login: (token: string, user: UserProfile) => {
      localStorage.setItem('buenvecino_token', token);
      localStorage.setItem('buenvecino_user', JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
    },
    logout: () => {
      localStorage.removeItem('buenvecino_token');
      localStorage.removeItem('buenvecino_user');
      set({ token: null, user: null, isAuthenticated: false });
    },
  };
});
