import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './features/auth/LoginPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { POSPage } from './features/pos/POSPage';
import { InventarioPage } from './features/inventario/InventarioPage';
import { HistorialVentasPage } from './features/ventas/HistorialVentasPage';
import { PrediccionesPage } from './features/predicciones/PrediccionesPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta Pública */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rutas Protegidas (Cajeros y Admin) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<POSPage />} />
            <Route path="/inventario" element={<InventarioPage />} />
            <Route path="/ventas" element={<HistorialVentasPage />} />

            {/* Ruta Solo Administrador */}
            <Route element={<ProtectedRoute requiredRole="administrador" />}>
              <Route path="/predicciones" element={<PrediccionesPage />} />
            </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
