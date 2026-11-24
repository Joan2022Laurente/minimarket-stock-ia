import React, { useState, useEffect } from 'react';
import { Search, Eye, Printer, X } from 'lucide-react';
import { ventaService } from '../../services/api';
import { VentaListItem, VentaTicketDetail } from '../../types/venta';

export const HistorialVentasPage: React.FC = () => {
  const [ventas, setVentas] = useState<VentaListItem[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<VentaTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadVentas();
  }, []);

  const loadVentas = async () => {
    setLoading(true);
    try {
      const data = await ventaService.list(50, 0);
      setVentas(data);
    } catch (err) {
      console.error('Error cargando historial de ventas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerDetalle = async (id: number) => {
    try {
      const ticket = await ventaService.getTicket(id);
      setSelectedTicket(ticket);
    } catch (err) {
      console.error('Error obteniendo detalle del ticket:', err);
    }
  };

  const filteredVentas = ventas.filter(
    (v) =>
      v.numero_ticket.toLowerCase().includes(search.toLowerCase()) ||
      v.cajero_nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Historial de Ventas</h2>
          <p className="text-xs text-slate-500 mt-0.5">Tickets emitidos en caja y desglose tributario</p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ticket o cajero..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Tabla de Ventas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Ticket</th>
                <th className="py-3 px-4">Fecha y Hora</th>
                <th className="py-3 px-4">Cajero</th>
                <th className="py-3 px-4">Método de Pago</th>
                <th className="py-3 px-4 text-right">Total (S/)</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    Cargando ventas...
                  </td>
                </tr>
              ) : filteredVentas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    No se encontraron tickets de venta.
                  </td>
                </tr>
              ) : (
                filteredVentas.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">{v.numero_ticket}</td>
                    <td className="py-3 px-4 text-slate-500">{new Date(v.created_at).toLocaleString('es-PE')}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{v.cajero_nombre}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 uppercase">
                        {v.metodo_pago}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-sm text-slate-900">
                      S/ {Number(v.total).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleVerDetalle(v.id)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                        title="Ver ticket"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle de Ticket */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 px-5 py-3.5 flex justify-between items-center text-white">
              <h4 className="font-bold text-sm">Detalle de Ticket de Venta</h4>
              <button onClick={() => setSelectedTicket(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-center border-b border-dashed border-slate-300 pb-3 font-mono">
                <p className="font-bold text-sm text-slate-900">MINIMARKET EL BUEN VECINO</p>
                <p className="text-xs text-emerald-600 font-extrabold mt-0.5">{selectedTicket.numero_ticket}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {new Date(selectedTicket.created_at).toLocaleString('es-PE')} · Cajero: {selectedTicket.cajero_nombre}
                </p>
              </div>

              {/* Lista de Ítems */}
              <div className="divide-y divide-slate-100 text-xs">
                {selectedTicket.items.map((item, idx) => (
                  <div key={idx} className="py-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-800">{item.producto_nombre}</span>
                      <span className="block text-[11px] text-slate-400">
                        {item.cantidad} unids x S/ {Number(item.precio_unitario).toFixed(2)}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">
                      S/ {Number(item.subtotal).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Desglose de Totales */}
              <div className="border-t border-dashed border-slate-300 pt-3 space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>S/ {Number(selectedTicket.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>IGV (18%):</span>
                  <span>S/ {Number(selectedTicket.igv).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1 border-t border-slate-200">
                  <span>TOTAL PAGADO:</span>
                  <span className="text-emerald-700">S/ {Number(selectedTicket.total).toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 flex space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Boleta</span>
                </button>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-xs font-bold"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
