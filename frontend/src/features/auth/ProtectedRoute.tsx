import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';

interface ProtectedRouteProps {
  requiredRole?: 'administrador' | 'cajero';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole }) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.rol !== requiredRole && user?.rol !== 'administrador') {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto mt-12">
        <h3 className="text-lg font-bold text-slate-800">Acceso Restringido</h3>
        <p className="text-sm text-slate-500 mt-2">
          Esta sección está reservada exclusivamente para el administrador del minimarket.
        </p>
      </div>
    );
  }

  return <Outlet />;
};
