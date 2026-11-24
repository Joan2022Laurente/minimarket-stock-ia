import React, { useState, useEffect } from 'react';
import {
  Search,
  PlusCircle,
} from 'lucide-react';
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
  const totalItems = items.length || 1;

  return (
    <div className="space-y-6">
      {/* 3 Tarjetas KPI Superiores de Inventario Real con Estética FinPoint */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Crítico */}
        <div className="bg-[#141416] rounded-[28px] border border-white/[0.08] p-6 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">
              Stock Crítico
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FF4D6A]/20 text-[#FF4D6A] text-[11px] font-bold">
              Quiebre inminente
            </span>
          </div>
          <div className="py-2">
            <div className="text-4xl font-extrabold text-[#FF4D6A] font-sans">
              {countCriticos}
            </div>
            <p className="text-xs text-[#8E8E93] mt-1">SKUs con menos de 2 días de stock</p>
          </div>
          <div className="mt-3">
            <StatBar current={countCriticos} max={totalItems} color="danger" />
          </div>
        </div>

        {/* Bajo */}
        <div className="bg-[#141416] rounded-[28px] border border-white/[0.08] p-6 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">
              Stock Bajo
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFD21F]/20 text-[#FFD21F] text-[11px] font-bold">
              Por reponer
            </span>
          </div>
          <div className="py-2">
            <div className="text-4xl font-extrabold text-[#FFD21F] font-sans">
              {countBajos}
            </div>
            <p className="text-xs text-[#8E8E93] mt-1">SKUs por debajo del mínimo</p>
          </div>
          <div className="mt-3">
            <StatBar current={countBajos} max={totalItems} color="warning" />
          </div>
        </div>

        {/* Óptimo */}
        <div className="bg-[#141416] rounded-[28px] border border-white/[0.08] p-6 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">
              Stock Saludable
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#34D399]/20 text-[#34D399] text-[11px] font-bold">
              Óptimo
            </span>
          </div>
          <div className="py-2">
            <div className="text-4xl font-extrabold text-[#34D399] font-sans">
              {countOptimos}
            </div>
            <p className="text-xs text-[#8E8E93] mt-1">SKUs con cobertura adecuada</p>
          </div>
          <div className="mt-3">
            <StatBar current={countOptimos} max={totalItems} color="success" />
          </div>
        </div>
      </div>

      {/* Contenedor Principal: Filtros y Tabla */}
      <div className="bg-[#141416] rounded-[28px] border border-white/[0.08] p-6 shadow-card space-y-5">
        {/* Pestañas y Filtros */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/[0.06]">
          {/* Pestañas en Píldora */}
          <div className="flex items-center gap-1 bg-[#0A0A0C] p-1.5 rounded-full border border-white/[0.08]">
            <button
              onClick={() => setActiveTab('stock')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                activeTab === 'stock'
                  ? 'bg-white text-black shadow-md'
                  : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              Niveles de Stock ({items.length})
            </button>
            <button
              onClick={() => setActiveTab('kardex')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                activeTab === 'kardex'
                  ? 'bg-white text-black shadow-md'
                  : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              Kardex / Movimientos ({kardex.length})
            </button>
          </div>

          {/* Buscador y Filtro por Estado */}
          {activeTab === 'stock' && (
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por SKU o nombre..."
                  className="w-full h-10 pl-10 pr-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white placeholder-[#5C5C62] focus:outline-none focus:border-white/20"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#1C1C1F] p-1 rounded-full border border-white/[0.06]">
                {[
                  { id: 'todos', label: 'Todos' },
                  { id: 'critico', label: 'Crítico' },
                  { id: 'bajo', label: 'Bajo' },
                  { id: 'optimo', label: 'Óptimo' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterEstado(f.id)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      filterEstado === f.id
                        ? 'bg-white text-black shadow-sm'
                        : 'text-[#8E8E93] hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabla de Productos o Kardex */}
        {loading ? (
          <div className="p-12 text-center text-[#8E8E93] text-sm">Cargando inventario...</div>
        ) : activeTab === 'stock' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.06] text-[#8E8E93] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">SKU / Código</th>
                  <th className="py-3 px-4">Producto</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4">Capacidad de Almacén</th>
                  <th className="py-3 px-4">Stock</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredItems.map((prod) => (
                  <tr key={prod.id} className="hover:bg-white/[0.02] transition-colors h-14">
                    <td className="py-3 px-4 font-mono text-[#8E8E93]">{prod.codigo_barras}</td>
                    <td className="py-3 px-4 font-bold text-white">{prod.nombre}</td>
                    <td className="py-3 px-4 text-[#8E8E93]">{prod.categoria}</td>
                    <td className="py-3 px-4 w-48">
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
                        <span className="text-[10px] text-[#5C5C62] font-mono w-10 text-right">
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
                        className="px-3 py-1.5 rounded-full bg-[#1C1C1F] border border-white/[0.08] hover:border-white/30 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-[#FF4A15]" />
                        <span>Ajustar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.06] text-[#8E8E93] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Producto</th>
                  <th className="py-3 px-4">Tipo Movimiento</th>
                  <th className="py-3 px-4">Cantidad</th>
                  <th className="py-3 px-4">Stock Resultante</th>
                  <th className="py-3 px-4">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {kardex.map((k) => {
                  const isPositive = k.cantidad > 0;
                  return (
                    <tr key={k.id} className="hover:bg-white/[0.02] transition-colors h-14">
                      <td className="py-3 px-4 font-mono text-[#8E8E93]">
                        {new Date(k.created_at).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 font-bold text-white">{k.producto_nombre}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-full bg-[#1C1C1F] text-[#8E8E93] text-[10px] font-mono">
                          {k.tipo}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-sm">
                        <span className={isPositive ? 'text-[#34D399]' : 'text-[#FF4D6A]'}>
                          {isPositive ? `+${k.cantidad}` : k.cantidad}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-white">{k.stock_posterior} u</td>
                      <td className="py-3 px-4 text-[#8E8E93]">{k.motivo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Ajuste Stock */}
      <StockAjusteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        producto={selectedProd}
        onSuccess={loadData}
      />
    </div>
  );
};
