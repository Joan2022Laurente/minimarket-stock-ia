import React, { useState, useEffect } from 'react';
import { Package, Search, AlertTriangle, CheckCircle, Flame, History } from 'lucide-react';
import { inventarioService } from '../../services/api';
import { StockAjusteModal } from './StockAjusteModal';

export const InventarioPage: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [kardex, setKardex] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'stock' | 'kardex'>('stock');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [loading, setLoading] = useState(true);
  const [selectedProd, setSelectedProd] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stockData, kardexData] = await Promise.all([
        inventarioService.listStatus(),
        inventarioService.getKardex(),
      ]);
      setItems(stockData);
      setKardex(kardexData);
    } catch (err) {
      console.error('Error cargando inventario:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.nombre.toLowerCase().includes(search.toLowerCase()) ||
      item.codigo_barras.includes(search);
    const matchesFilter =
      filterEstado === 'todos' || item.estado_stock === filterEstado;
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'critico':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
            <Flame className="w-3.5 h-3.5" />
            <span>Crítico</span>
          </span>
        );
      case 'bajo':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Bajo</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Óptimo</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera y Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Control de Inventario y Kardex</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Semáforos de stock en tiempo real y auditoría de movimientos
          </p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'stock'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Stock Actual</span>
          </button>
          <button
            onClick={() => setActiveTab('kardex')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'kardex'
                ? 'bg-slate-900 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Movimientos Kardex</span>
          </button>
        </div>
      </div>

      {activeTab === 'stock' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Barra de Filtros y Búsqueda */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código o producto..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex space-x-1.5">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'critico', label: 'Críticos (Rojo)' },
                { id: 'bajo', label: 'Bajo (Amarillo)' },
                { id: 'optimo', label: 'Óptimo (Verde)' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterEstado(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filterEstado === f.id
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla de Stock */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Producto</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4 text-center">Stock Actual</th>
                  <th className="py-3 px-4 text-center">Mín / Seg</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Cargando inventario...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      No se encontraron productos en el inventario.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-500">{prod.codigo_barras}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{prod.nombre}</td>
                      <td className="py-3 px-4 text-slate-600">{prod.categoria_nombre || 'General'}</td>
                      <td className="py-3 px-4 text-center font-extrabold text-sm">{prod.stock_actual}</td>
                      <td className="py-3 px-4 text-center text-slate-500 font-mono">
                        {prod.stock_minimo} / {prod.stock_seguridad}
                      </td>
                      <td className="py-3 px-4 text-center">{getStatusBadge(prod.estado_stock)}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedProd(prod);
                            setIsModalOpen(true);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Vista de Kardex */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-4">
          <h3 className="font-bold text-sm text-slate-800 mb-3">Movimientos de Entrada y Salida (Últimos 100)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Producto</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-center">Variación</th>
                  <th className="py-2.5 px-3 text-center">Stock Post</th>
                  <th className="py-2.5 px-3">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {kardex.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-500 font-sans">{new Date(k.created_at).toLocaleString('es-PE')}</td>
                    <td className="py-2.5 px-3 font-bold font-sans text-slate-900">{k.producto_nombre}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {k.tipo}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-center font-bold ${k.cantidad > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {k.cantidad > 0 ? `+${k.cantidad}` : k.cantidad}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-900">{k.stock_posterior}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-500">{k.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Ajuste */}
      <StockAjusteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        producto={selectedProd}
        onSuccess={loadData}
      />
    </div>
  );
};
