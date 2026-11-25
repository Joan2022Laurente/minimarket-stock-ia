import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Lock, Mail, ArrowRight, ShieldCheck, UserCheck, User } from 'lucide-react';
import { authService } from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';

export const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data =
        mode === 'login'
          ? await authService.login(email, password)
          : await authService.register(nombre, email, password);

      login(data.access_token, {
        id: data.user_id,
        nombre: data.nombre,
        email,
        rol: data.rol,
        activo: true,
      });
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          (mode === 'login'
            ? 'Error al iniciar sesión. Verifique sus credenciales.'
            : 'No se pudo completar el registro.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (quickEmail: string, quickPass: string) => {
    setMode('login');
    setEmail(quickEmail);
    setPassword(quickPass);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-4 selection:bg-[#FF4A15] selection:text-white">
      <div className="bg-[#141416] rounded-card border border-white/[0.08] max-w-[440px] w-full p-8 sm:p-10 shadow-2xl relative overflow-hidden">
        {/* Glow sutil de fondo */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-[#FF4A15]/10 blur-3xl pointer-events-none"></div>

        {/* Header con Isotipo FinPoint */}
        <div className="text-center mb-8 relative">
          <div className="w-14 h-14 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20 text-black">
            <Layers className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight font-sans">
            BuenVecino POS
          </h2>
          <p className="text-xs text-[#8E8E93] mt-1 font-medium">
            Terminal predictiva con arquitectura FinPoint
          </p>
        </div>

        {/* Selector Login / Registro */}
        <div className="flex items-center gap-1 bg-[#0A0A0C] p-1 rounded-full border border-white/[0.08] mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-full text-xs font-bold transition-all ${
              mode === 'login' ? 'bg-white text-black shadow-sm' : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-full text-xs font-bold transition-all ${
              mode === 'register' ? 'bg-white text-black shadow-sm' : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            Registrar Cajero
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-[#FF4D6A]/15 border border-[#FF4D6A]/30 rounded-2xl text-[#FF4D6A] text-xs text-center font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider mb-1.5 block">
                Nombre Completo
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8E8E93] absolute left-4 top-4 pointer-events-none" />
                <input
                  type="text"
                  required
                  minLength={2}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Ana Torres"
                  className="w-full h-12 pl-11 pr-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white placeholder-[#5C5C62] focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider mb-1.5 block">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#8E8E93] absolute left-4 top-4 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@elbuenvecino.com"
                className="w-full h-12 pl-11 pr-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white placeholder-[#5C5C62] focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider mb-1.5 block">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8E8E93] absolute left-4 top-4 pointer-events-none" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 pl-11 pr-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white placeholder-[#5C5C62] focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          {/* Gran Botón Blanco Estilo FinPoint */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 bg-white hover:bg-neutral-100 text-black font-extrabold text-sm rounded-full transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
          >
            <span>
              {loading
                ? 'Procesando...'
                : mode === 'login'
                ? 'Iniciar Sesión'
                : 'Crear Cuenta de Cajero'}
            </span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </form>

        {/* Acceso Rápido Demo en Cápsulas */}
        <div className="mt-8 pt-6 border-t border-white/[0.06]">
          <p className="text-[11px] text-[#8E8E93] font-semibold mb-3 text-center">
            Perfiles de demostración rápida:
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@elbuenvecino.com', 'admin123')}
              className={`p-3 rounded-tile text-left transition-all bg-[#1C1C1F] border ${
                email === 'admin@elbuenvecino.com'
                  ? 'border-[#FF4A15] shadow-[0_0_15px_rgba(255,74,21,0.25)]'
                  : 'border-white/[0.06] hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[#FF4A15] text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </div>
              <p className="text-[10px] text-[#8E8E93] truncate mt-0.5">Control Total</p>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('cajero1@elbuenvecino.com', 'cajero123')}
              className={`p-3 rounded-tile text-left transition-all bg-[#1C1C1F] border ${
                email === 'cajero1@elbuenvecino.com'
                  ? 'border-[#34D399] shadow-[0_0_15px_rgba(52,211,153,0.25)]'
                  : 'border-white/[0.06] hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[#34D399] text-xs font-bold">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Cajero</span>
              </div>
              <p className="text-[10px] text-[#8E8E93] truncate mt-0.5">Caja POS</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
