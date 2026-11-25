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
      <div className="p-8 text-center bg-[#141416] rounded-card border border-white/[0.08] max-w-md mx-auto mt-12">
        <h3 className="text-lg font-extrabold text-white">Acceso Restringido</h3>
        <p className="text-xs text-[#8E8E93] mt-2 leading-relaxed">
          Esta sección está reservada exclusivamente para el administrador del minimarket.
        </p>
      </div>
    );
  }

  return <Outlet />;
};
