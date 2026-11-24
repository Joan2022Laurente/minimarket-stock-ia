import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Package,
  Receipt,
  Sparkles,
  LogOut,
  Store,
  Sun,
  Moon,
  User as UserIcon,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useCartStore } from '../../stores/useCartStore';
import { useThemeStore } from '../../stores/useThemeStore';

export const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { getItemsCount } = useCartStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Caja / POS', path: '/', icon: ShoppingCart, badge: getItemsCount() || null },
    { label: 'Inventario', path: '/inventario', icon: Package },
    { label: 'Ventas', path: '/ventas', icon: Receipt },
    ...(user?.rol === 'administrador'
      ? [{ label: 'Predicciones IA', path: '/predicciones', icon: Sparkles, isAi: true }]
      : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      {/* Topbar Glassmorphism en Píldora */}
      <header className="glass sticky top-0 z-30 mx-3 sm:mx-6 mt-3 sm:mt-4 flex flex-wrap items-center justify-between rounded-full px-3 sm:px-5 py-2 shadow-card gap-2">
        {/* Logo de Marca */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white shadow-hero">
            <Store className="w-5 h-5" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-display font-bold text-sm tracking-tight text-ink leading-tight">
              El Buen Vecino
            </h1>
            <p className="text-[10px] text-ink-muted uppercase font-mono tracking-wider">POS & IA</p>
          </div>
        </div>

        {/* Navegación Central en Píldora */}
        <nav className="flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `rounded-full px-3.5 sm:px-5 h-9 sm:h-10 inline-flex items-center gap-2 text-xs sm:text-sm font-medium transition duration-150 whitespace-nowrap ${
                    isActive
                      ? 'bg-ink text-canvas font-semibold shadow-sm'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-3'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="pill bg-brand-500 text-white font-bold h-5 px-2 text-[10px]">
                    {item.badge}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        {/* Acciones Derecha: Modo Mostrador (Tema), Usuario y Salida */}
        <div className="flex items-center gap-2">
          {/* Switch Modo Mostrador (Claro/Oscuro) */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Activar Modo Mostrador (Claro)' : 'Activar Modo Nocturno'}
            className="p-2 rounded-full bg-surface-2 border border-line text-ink-muted hover:text-ink hover:bg-surface-3 transition"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-warning" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* User Chip */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-line text-xs">
            <UserIcon className="w-3.5 h-3.5 text-ink-muted" />
            <span className="font-semibold text-ink">{user?.nombre}</span>
            <span className="label-dot text-brand-500 text-[11px] uppercase font-mono">
              {user?.rol}
            </span>
          </div>

          {/* Botón Salir */}
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="p-2 rounded-full text-ink-muted hover:text-danger hover:bg-surface-2 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Área de Contenido Principal */}
      <main className="flex-1 mx-auto max-w-[1600px] w-full p-3 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
};
