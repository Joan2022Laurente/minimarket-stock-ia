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
      {/* Cabecera y Filtro */}
      <div className="card flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-brand-500" />
            <h2 className="font-display text-lg font-bold text-ink">Historial de Ventas</h2>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">Tickets emitidos en caja y desglose tributario</p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ticket o cajero..."
            className="w-full h-10 pl-9 text-xs"
          />
        </div>
      </div>

      {/* Tabla de Ventas */}
      {loading ? (
        <div className="card p-12 text-center text-ink-muted text-sm">Cargando transacciones...</div>
      ) : filteredVentas.length === 0 ? (
        <div className="card p-12 text-center text-ink-muted text-sm">
          No se encontraron ventas registradas.
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 border-b border-line text-ink-muted font-medium">
                <tr>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Ticket #</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Fecha / Hora</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Cajero</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Método de Pago</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider text-right">Subtotal</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider text-right">IGV (18%)</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider text-right">Total</th>
                  <th className="py-3.5 px-4 font-semibold uppercase tracking-wider text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {filteredVentas.map((v) => {
                  const subtotal = Number((v.total / 1.18).toFixed(2));
                  const igv = Number((v.total - subtotal).toFixed(2));
                  return (
                    <tr key={v.id} className="hover:bg-surface-2/60 transition h-14">
                      <td className="py-3 px-4 font-mono font-bold text-ink">{v.numero_ticket}</td>
                      <td className="py-3 px-4 font-mono text-ink-muted">
                        {new Date(v.created_at).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 text-ink font-medium">{v.cajero_nombre}</td>
                      <td className="py-3 px-4">
                        <span className="pill bg-surface-3 text-ink-muted uppercase font-mono text-[10px]">
                          {v.metodo_pago}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-ink-muted">
                        S/ {subtotal.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-ink-muted">
                        S/ {igv.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-display font-bold text-sm text-ink tabular-nums">
                        S/ {Number(v.total).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleVerDetalle(v.id)}
                          className="btn-ghost h-8 px-3 text-xs font-semibold gap-1 inline-flex items-center"
                        >
                          <Eye className="w-3.5 h-3.5 text-brand-500" />
                          <span>Ver Ticket</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Ticket sobre Papel Blanco Fijo */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass card max-w-md w-full p-6 shadow-pop animate-pop border border-line">
            <div className="flex justify-between items-center border-b border-line pb-3 mb-4">
              <h3 className="font-display font-bold text-base text-ink">Comprobante de Venta</h3>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-1 rounded-full text-ink-muted hover:text-ink hover:bg-surface-3 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vista del Ticket en Papel Térmico Blanco */}
            <div className="bg-white text-slate-900 rounded-tile p-5 shadow-inner font-mono text-xs space-y-2 border border-slate-200">
              <div className="text-center border-b border-slate-300 pb-2">
                <h4 className="font-bold text-sm tracking-tight">MINIMARKET EL BUEN VECINO</h4>
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
                    <span className="font-bold tabular-nums">S/ {Number(it.subtotal).toFixed(2)}</span>
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
                <div className="flex justify-between text-[10px] text-slate-500 pt-1">
                  <span>Método de Pago:</span>
                  <span className="uppercase">{selectedTicket.metodo_pago}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-ghost flex-1 h-12 flex items-center justify-center gap-2 text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="btn-primary flex-1 h-12 shadow-hero text-xs font-bold"
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
