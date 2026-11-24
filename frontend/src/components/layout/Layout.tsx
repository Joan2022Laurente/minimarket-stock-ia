import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, Receipt, Sparkles, LogOut, Store } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useCartStore } from '../../stores/useCartStore';

export const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { getItemsCount } = useCartStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Caja / POS', path: '/', icon: ShoppingCart, badge: getItemsCount() || null },
    { label: 'Inventario & Stock', path: '/inventario', icon: Package },
    { label: 'Historial Ventas', path: '/ventas', icon: Receipt },
    ...(user?.rol === 'administrador'
      ? [{ label: 'Predicciones IA', path: '/predicciones', icon: Sparkles, highlight: true }]
      : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Navbar */}
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          {/* Logo y Nombre */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-inner">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight text-white">
                El Buen Vecino
              </h1>
              <p className="text-xs text-emerald-400 font-medium">Minimarket POS & AI</p>
            </div>
          </div>

          {/* Navegación Principal */}
          <nav className="flex space-x-1 sm:space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  } ${item.highlight && !isActive ? 'text-emerald-400 border border-emerald-500/30' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-white text-emerald-700 font-bold">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Usuario y Logout */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-white">{user?.nombre}</span>
              <span className="text-[11px] text-emerald-400 uppercase font-mono tracking-wider">
                {user?.rol}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
