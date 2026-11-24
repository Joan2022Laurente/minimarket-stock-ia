import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  LogOut,
  ShoppingCart,
  Package,
  Receipt,
  Store,
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
      {/* Top Header Limpio y Funcional */}
      <header className="sticky top-0 z-40 px-4 sm:px-8 pt-4 pb-2 bg-[#0A0A0C]/90 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          {/* Logo y Nombre del Minimarket */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF4A15] flex items-center justify-center text-white shadow-lg shadow-[#FF4A15]/20">
              <Store className="w-5 h-5" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white font-sans">
                El Buen Vecino
              </span>
              <span className="text-[11px] text-[#8E8E93] font-mono hidden sm:inline">POS</span>
            </div>
          </div>

          {/* Navegación Central en Píldora */}
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

          {/* Información Real de Sesión y Salida */}
          <div className="flex items-center gap-2.5">
            {/* Chip de Usuario */}
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#141416] border border-white/[0.08] text-xs">
              <span className="font-bold text-white">{user?.nombre}</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-[#8E8E93]">
                {user?.rol}
              </span>
            </div>

            {/* Botón Salir Funcional */}
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="h-9 px-3.5 rounded-full bg-[#141416] border border-white/[0.08] hover:border-[#FF4D6A]/40 hover:text-[#FF4D6A] text-[#8E8E93] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-8 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
};
