import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Lock, Mail, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';
import { authService } from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await authService.login(email, password);
      login(data.access_token, {
        id: data.user_id,
        nombre: data.nombre,
        email,
        rol: data.rol,
        activo: true,
      });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al iniciar sesión. Verifique sus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20 text-white">
            <Store className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Minimarket El Buen Vecino</h2>
          <p className="text-sm text-slate-400 mt-1">Punto de venta y gestión predictiva de inventarios</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@elbuenvecino.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 disabled:opacity-50 mt-2"
          >
            <span>{loading ? 'Ingresando...' : 'Iniciar Sesión'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Acceso Rápido Demo / Pruebas */}
        <div className="mt-8 pt-6 border-t border-slate-700/60">
          <p className="text-xs text-slate-400 font-medium mb-3 text-center">
            Cuentas de demostración preconfiguradas:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@elbuenvecino.com', 'admin123')}
              className="p-2.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left transition-all group"
            >
              <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Administrador</span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">admin@elbuenvecino.com</p>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('cajero1@elbuenvecino.com', 'cajero123')}
              className="p-2.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left transition-all group"
            >
              <div className="flex items-center space-x-1.5 text-blue-400 text-xs font-semibold">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Cajero Caja 1</span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">cajero1@elbuenvecino.com</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
