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
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="card max-w-[420px] w-full p-8 shadow-card border border-line">
        {/* Header con isotipo hero */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-hero text-white">
            <Store className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-ink tracking-tight">
            El Buen Vecino
          </h2>
          <p className="text-xs text-ink-muted mt-1">Punto de venta y gestión predictiva de inventarios</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-danger-soft border border-danger/30 rounded-chip text-danger text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="label mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-ink-faint absolute left-3.5 top-4" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@elbuenvecino.com"
                className="w-full pl-10"
              />
            </div>
          </div>

          <div>
            <label className="label mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-ink-faint absolute left-3.5 top-4" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full h-14 mt-3 shadow-hero text-base"
          >
            <span>{loading ? 'Ingresando...' : 'Iniciar Sesión'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Acceso Rápido Demo / Pruebas */}
        <div className="mt-8 pt-6 border-t border-line-soft">
          <p className="text-[11px] text-ink-muted font-medium mb-3 text-center">
            Perfiles de demostración preconfigurados:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@elbuenvecino.com', 'admin123')}
              className={`p-3 tile text-left transition-all group ${
                email === 'admin@elbuenvecino.com' ? 'border-brand-500 bg-surface-3 shadow-focus' : 'hover:bg-surface-3'
              }`}
            >
              <div className="flex items-center gap-1.5 text-brand-500 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </div>
              <p className="text-[10px] text-ink-muted truncate mt-1">Control total</p>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('cajero@elbuenvecino.com', 'cajero123')}
              className={`p-3 tile text-left transition-all group ${
                email === 'cajero@elbuenvecino.com' ? 'border-brand-500 bg-surface-3 shadow-focus' : 'hover:bg-surface-3'
              }`}
            >
              <div className="flex items-center gap-1.5 text-success text-xs font-semibold">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Cajero</span>
              </div>
              <p className="text-[10px] text-ink-muted truncate mt-1">Caja POS</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
