import React, { useState, useEffect } from 'react';
import { Search, Eye, Printer, X, Receipt } from 'lucide-react';
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
      {/* Cabecera FinPoint Card */}
      <div className="bg-[#141416] rounded-[28px] border border-white/[0.08] p-7 shadow-card flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#FF4A15]" />
            <h2 className="text-lg font-bold text-white tracking-tight">Historial de Ventas</h2>
          </div>
          <p className="text-xs text-[#8E8E93] mt-0.5">Tickets emitidos en caja y desglose tributario</p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ticket o cajero..."
            className="w-full h-10 pl-10 pr-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white placeholder-[#5C5C62] focus:outline-none focus:border-white/20"
          />
        </div>
      </div>

      {/* Tabla de Ventas en Tarjeta FinPoint */}
      <div className="bg-[#141416] rounded-[28px] border border-white/[0.08] p-6 shadow-card">
        {loading ? (
          <div className="p-12 text-center text-[#8E8E93] text-sm">Cargando transacciones...</div>
        ) : filteredVentas.length === 0 ? (
          <div className="p-12 text-center text-[#8E8E93] text-sm">
            No se encontraron ventas registradas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.06] text-[#8E8E93] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Ticket #</th>
                  <th className="py-3.5 px-4">Fecha / Hora</th>
                  <th className="py-3.5 px-4">Cajero</th>
                  <th className="py-3.5 px-4">Método de Pago</th>
                  <th className="py-3.5 px-4 text-right">Subtotal</th>
                  <th className="py-3.5 px-4 text-right">IGV (18%)</th>
                  <th className="py-3.5 px-4 text-right">Total</th>
                  <th className="py-3.5 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredVentas.map((v) => {
                  const subtotal = Number((v.total / 1.18).toFixed(2));
                  const igv = Number((v.total - subtotal).toFixed(2));
                  return (
                    <tr key={v.id} className="hover:bg-white/[0.02] transition-colors h-14">
                      <td className="py-3 px-4 font-mono font-bold text-white">{v.numero_ticket}</td>
                      <td className="py-3 px-4 font-mono text-[#8E8E93]">
                        {new Date(v.created_at).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 text-white font-medium">{v.cajero_nombre}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-full bg-[#1C1C1F] text-[#8E8E93] uppercase font-mono text-[10px]">
                          {v.metodo_pago}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#8E8E93]">
                        S/ {subtotal.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#8E8E93]">
                        S/ {igv.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-sm text-white font-sans">
                        S/ {Number(v.total).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleVerDetalle(v.id)}
                          className="px-3 py-1.5 rounded-full bg-[#1C1C1F] border border-white/[0.08] hover:border-white/30 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#FF4A15]" />
                          <span>Ver Ticket</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detalle Ticket */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#141416] rounded-[28px] border border-white/[0.1] max-w-md w-full p-7 shadow-2xl animate-pop text-white">
            <div className="flex justify-between items-center pb-3 border-b border-white/[0.08] mb-4">
              <h3 className="font-extrabold text-base text-white">Comprobante de Venta</h3>
              <button
                onClick={() => setSelectedTicket(null)}
                className="w-8 h-8 rounded-full bg-[#1C1C1F] border border-white/[0.08] flex items-center justify-center text-[#8E8E93] hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white text-slate-900 rounded-[20px] p-5 font-mono text-xs space-y-2 shadow-inner">
              <div className="text-center border-b border-slate-300 pb-2">
                <h4 className="font-extrabold text-sm text-slate-900">MINIMARKET EL BUEN VECINO</h4>
                <p className="text-[10px] text-slate-500">RUC: 20123456789</p>
                <p className="font-bold text-xs mt-1 text-slate-800">{selectedTicket.numero_ticket}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Fecha: {new Date(selectedTicket.created_at).toLocaleString('es-PE')}
                </p>
                <p className="text-[10px] text-slate-500">Cajero: {selectedTicket.cajero_nombre}</p>
              </div>

              <div className="space-y-1 py-2 border-b border-slate-300 text-[11px]">
                {selectedTicket.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate max-w-[180px]">
                      {it.cantidad}x {it.producto_nombre}
                    </span>
                    <span className="font-bold">S/ {Number(it.subtotal).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-0.5 pt-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>S/ {Number(selectedTicket.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IGV (18%):</span>
                  <span>S/ {Number(selectedTicket.igv).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-slate-400 pt-1">
                  <span>TOTAL:</span>
                  <span>S/ {Number(selectedTicket.total).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 pt-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 h-12 rounded-full bg-[#1C1C1F] border border-white/[0.08] text-xs font-bold text-white flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="flex-1 h-12 rounded-full bg-white text-black text-xs font-extrabold shadow-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
