import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Search,
  Bell,
  LogOut,
  Layers,
  ShoppingCart,
  Package,
  Receipt,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useCartStore } from '../../stores/useCartStore';

export const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { getItemsCount } = useCartStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Caja POS', path: '/', icon: ShoppingCart, badge: getItemsCount() || null },
    { label: 'Inventario', path: '/inventario', icon: Package },
    { label: 'Ventas', path: '/ventas', icon: Receipt },
    ...(user?.rol === 'administrador'
      ? [{ label: 'Predicciones IA', path: '/predicciones', icon: Sparkles }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white flex flex-col antialiased selection:bg-[#FF4A15] selection:text-white">
      {/* Top Header estilo FinPoint */}
      <header className="sticky top-0 z-40 px-4 sm:px-8 pt-4 pb-2 bg-[#0A0A0C]/90 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          {/* Logo FinPoint style */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-[#0A0A0C] shadow-lg shadow-emerald-500/20">
              <Layers className="w-5 h-5 text-black" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-extrabold text-lg tracking-tight text-white font-sans">
                BuenVecino
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            </div>
          </div>

          {/* Segmented Pill Navigation Central (Idéntica a FinPoint) */}
          <nav className="flex items-center gap-1 bg-[#141416] p-1.5 rounded-full border border-white/[0.08] shadow-inner overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `px-5 py-2 rounded-full text-xs font-bold transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${
                    isActive
                      ? 'bg-white text-black shadow-md scale-100'
                      : 'text-[#8E8E93] hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="w-4 h-4 rounded-full bg-[#FF4A15] text-white text-[10px] flex items-center justify-center font-bold">
                    {item.badge}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>

          {/* Acciones Derecha (Círculos FinPoint) */}
          <div className="flex items-center gap-2.5">
            {/* Botón Buscar */}
            <button
              title="Buscar"
              className="w-10 h-10 rounded-full bg-[#141416] border border-white/[0.08] flex items-center justify-center text-[#8E8E93] hover:text-white hover:border-white/20 transition-all"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Botón Notificaciones */}
            <button
              title="Notificaciones"
              className="w-10 h-10 rounded-full bg-[#141416] border border-white/[0.08] flex items-center justify-center text-[#8E8E93] hover:text-white hover:border-white/20 transition-all relative"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[#FF4A15]"></span>
            </button>

            {/* Avatar de Usuario FinPoint */}
            <div className="flex items-center gap-2 pl-1">
              <div
                title={`${user?.nombre} (${user?.rol})`}
                className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-500 p-0.5 flex items-center justify-center cursor-pointer shadow-md"
              >
                <div className="w-full h-full rounded-full bg-[#141416] flex items-center justify-center text-xs font-bold text-white uppercase">
                  {user?.nombre?.slice(0, 2) || 'AD'}
                </div>
              </div>

              {/* Botón Cerrar Sesión */}
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="w-9 h-9 rounded-full bg-[#141416] border border-white/[0.08] flex items-center justify-center text-[#8E8E93] hover:text-[#FF4D6A] hover:border-[#FF4D6A]/30 transition-all ml-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido Principal con marco espaciado */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-8 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
};
