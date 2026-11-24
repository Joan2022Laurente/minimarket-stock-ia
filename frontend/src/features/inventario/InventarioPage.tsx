import React, { useState, useEffect } from 'react';
import { Package, Search, History, PlusCircle } from 'lucide-react';
import { inventarioService } from '../../services/api';
import { StockAjusteModal } from './StockAjusteModal';
import { StockBadge } from '../../components/ui/StockBadge';
import { StatBar } from '../../components/ui/StatBar';

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

  const countCriticos = items.filter((i) => i.estado_stock === 'critico').length;
  const countBajos = items.filter((i) => i.estado_stock === 'bajo').length;
  const countOptimos = items.filter((i) => i.estado_stock === 'optimo').length;

  return (
    <div className="space-y-6">
      {/* 3 Tarjetas KPI Superiores (Estilo FinPoint) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Crítico */}
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="label label-dot text-danger">Stock Crítico</span>
            <span className="pill bg-danger-soft text-danger">Quiebre inminente</span>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <span className="kpi text-danger">{countCriticos}</span>
            <span className="text-xs text-ink-muted mb-1.5">SKUs agotados o casi agotados</span>
          </div>
          <div className="mt-3">
            <StatBar current={countCriticos} max={items.length || 1} color="danger" />
          </div>
        </div>

        {/* Bajo */}
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="label label-dot text-warning">Stock Bajo</span>
            <span className="pill bg-warning-soft text-warning">Por reponer</span>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <span className="kpi text-warning">{countBajos}</span>
            <span className="text-xs text-ink-muted mb-1.5">SKUs bajo el mínimo</span>
          </div>
          <div className="mt-3">
            <StatBar current={countBajos} max={items.length || 1} color="warning" />
          </div>
        </div>

        {/* Óptimo */}
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="label label-dot text-success">Stock Saludable</span>
            <span className="pill bg-success-soft text-success">Óptimo</span>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <span className="kpi text-success">{countOptimos}</span>
            <span className="text-xs text-ink-muted mb-1.5">SKUs en nivel normal</span>
          </div>
          <div className="mt-3">
            <StatBar current={countOptimos} max={items.length || 1} color="success" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Selector de Pestaña */}
      <div className="card p-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        {/* Selector de Pestaña (Stock vs Kardex) */}
        <div className="flex gap-1 rounded-full border border-line bg-surface-2 p-1 self-start">
          <button
            onClick={() => setActiveTab('stock')}
            className={`rounded-full px-5 h-9 inline-flex items-center gap-2 text-xs font-semibold transition ${
              activeTab === 'stock'
                ? 'bg-ink text-canvas shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Niveles de Stock ({items.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('kardex')}
            className={`rounded-full px-5 h-9 inline-flex items-center gap-2 text-xs font-semibold transition ${
              activeTab === 'kardex'
                ? 'bg-ink text-canvas shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Kardex / Movimientos ({kardex.length})</span>
          </button>
        </div>

        {/* Búsqueda y Filtros de Estado */}
        {activeTab === 'stock' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-ink-faint absolute left-3 top-3.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por SKU o nombre..."
                className="w-full h-10 pl-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'critico', label: 'Crítico' },
                { id: 'bajo', label: 'Bajo' },
                { id: 'optimo', label: 'Óptimo' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterEstado(f.id)}
                  className={`rounded-full px-3 h-7 text-xs font-semibold transition ${
                    filterEstado === f.id
                      ? 'bg-ink text-canvas'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Contenido Principal: Tabla de Stock o Kardex */}
      {loading ? (
        <div className="card p-12 text-center text-ink-muted text-sm">
          Cargando datos de inventario...
        </div>
      ) : activeTab === 'stock' ? (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 border-b border-line text-ink-muted font-medium">
                <tr>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Código / SKU</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Producto</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Categoría</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Capacidad / Nivel</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Stock</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {filteredItems.map((prod) => (
                  <tr key={prod.id} className="hover:bg-surface-2/60 transition h-14">
                    <td className="py-3 px-4 font-mono text-ink-muted">{prod.codigo_barras}</td>
                    <td className="py-3 px-4 font-semibold text-ink">{prod.nombre}</td>
                    <td className="py-3 px-4 text-ink-muted">{prod.categoria}</td>
                    <td className="py-3 px-4 w-44">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <StatBar
                            current={prod.stock_actual}
                            max={prod.stock_maximo || 50}
                            color={
                              prod.estado_stock === 'critico'
                                ? 'danger'
                                : prod.estado_stock === 'bajo'
                                ? 'warning'
                                : 'success'
                            }
                          />
                        </div>
                        <span className="text-[10px] text-ink-faint font-mono w-10 text-right">
                          {Math.round((prod.stock_actual / (prod.stock_maximo || 50)) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StockBadge stock={prod.stock_actual} min={prod.stock_minimo} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedProd(prod);
                          setIsModalOpen(true);
                        }}
                        className="btn-ghost h-8 px-3 text-xs font-semibold gap-1 inline-flex items-center"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-brand-500" />
                        <span>Ajustar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Vista de Kardex */
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 border-b border-line text-ink-muted font-medium">
                <tr>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Fecha / Hora</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Producto</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Tipo Movimiento</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Cantidad</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Stock Resultante</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {kardex.map((k) => {
                  const isPositive = k.cantidad > 0;
                  return (
                    <tr key={k.id} className="hover:bg-surface-2/60 transition h-14">
                      <td className="py-3 px-4 font-mono text-ink-muted">
                        {new Date(k.created_at).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 font-semibold text-ink">{k.producto_nombre}</td>
                      <td className="py-3 px-4">
                        <span className="pill bg-surface-3 text-ink-muted text-[11px]">
                          {k.tipo}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-sm tabular-nums">
                        <span className={isPositive ? 'text-success' : 'text-danger'}>
                          {isPositive ? `+${k.cantidad}` : k.cantidad}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-ink">{k.stock_posterior} u</td>
                      <td className="py-3 px-4 text-ink-muted">{k.motivo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Ajuste de Stock */}
      <StockAjusteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        producto={selectedProd}
        onSuccess={loadData}
      />
    </div>
  );
};
