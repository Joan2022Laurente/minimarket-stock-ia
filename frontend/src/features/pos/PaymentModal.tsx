import React, { useState } from 'react';
import { CheckCircle2, DollarSign, Smartphone, CreditCard, X, Printer } from 'lucide-react';
import { ventaService } from '../../services/api';
import { useCartStore } from '../../stores/useCartStore';
import { VentaResponse } from '../../types/venta';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose }) => {
  const { items, getTotal, clearCart } = useCartStore();
  const [metodo, setMetodo] = useState<'efectivo' | 'yape_plin' | 'tarjeta'>('efectivo');
  const [montoPagado, setMontoPagado] = useState<number>(getTotal());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketVenta, setTicketVenta] = useState<VentaResponse | null>(null);

  if (!isOpen) return null;

  const total = getTotal();
  const vuelto = metodo === 'efectivo' ? Math.max(0, Number((montoPagado - total).toFixed(2))) : 0;

  const handleCobrar = async () => {
    setError(null);
    if (metodo === 'efectivo' && montoPagado < total) {
      setError('El monto pagado en efectivo no puede ser menor al total.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        metodo_pago: metodo,
        monto_pagado: metodo === 'efectivo' ? montoPagado : total,
        items: items.map((i) => ({
          producto_id: i.producto.id,
          cantidad: i.cantidad,
        })),
      };

      const res = await ventaService.checkout(payload);
      setTicketVenta(res);
      clearCart();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al procesar la venta en caja.');
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarTodo = () => {
    setTicketVenta(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
        {!ticketVenta ? (
          <div>
            {/* Header Cobro */}
            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg">Cobrar Venta</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Total a Pagar Grande */}
              <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
                <p className="text-xs uppercase font-semibold text-emerald-800 tracking-wider">
                  Total a Cobrar
                </p>
                <p className="text-3xl font-extrabold text-emerald-700 mt-1">
                  S/ {total.toFixed(2)}
                </p>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl text-center">
                  {error}
                </div>
              )}

              {/* Selector de Método de Pago */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Método de Pago
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMetodo('efectivo');
                      setMontoPagado(total);
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                      metodo === 'efectivo'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold shadow-sm'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <DollarSign className="w-5 h-5" />
                    <span className="text-xs">Efectivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMetodo('yape_plin');
                      setMontoPagado(total);
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                      metodo === 'yape_plin'
                        ? 'border-purple-500 bg-purple-50 text-purple-800 font-bold shadow-sm'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Smartphone className="w-5 h-5" />
                    <span className="text-xs">Yape / Plin</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMetodo('tarjeta');
                      setMontoPagado(total);
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                      metodo === 'tarjeta'
                        ? 'border-blue-500 bg-blue-50 text-blue-800 font-bold shadow-sm'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-xs">Tarjeta POS</span>
                  </button>
                </div>
              </div>

              {/* Opciones de Efectivo */}
              {metodo === 'efectivo' && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600">Paga con (S/):</span>
                    <input
                      type="number"
                      step="0.10"
                      min={total}
                      value={montoPagado}
                      onChange={(e) => setMontoPagado(Number(e.target.value))}
                      className="w-32 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-right font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Botones de billetes rápidos */}
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {[10, 20, 50, 100].map((billete) =>
                      billete >= total ? (
                        <button
                          key={billete}
                          type="button"
                          onClick={() => setMontoPagado(billete)}
                          className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg hover:border-emerald-500 hover:text-emerald-700"
                        >
                          S/ {billete}
                        </button>
                      ) : null
                    )}
                    <button
                      type="button"
                      onClick={() => setMontoPagado(total)}
                      className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg hover:border-emerald-500 hover:text-emerald-700"
                    >
                      Exacto
                    </button>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                    <span className="text-sm font-bold text-slate-700">Vuelto a entregar:</span>
                    <span className="text-xl font-black text-emerald-600">
                      S/ {vuelto.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Botón de Confirmar Venta */}
              <button
                type="button"
                onClick={handleCobrar}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 disabled:opacity-50 text-base"
              >
                <span>{loading ? 'Procesando en Supabase...' : 'Confirmar Venta (< 1s)'}</span>
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          /* Ticket de Venta Exitoso */
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900">¡Venta Registrada con Éxito!</h3>
              <p className="text-xs text-slate-500 mt-0.5">Transacción atómica completada en Supabase</p>
            </div>

            {/* Simulación de Ticket Impreso */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left font-mono text-xs space-y-2 max-w-sm mx-auto shadow-inner">
              <div className="text-center border-b border-dashed border-slate-300 pb-2">
                <p className="font-bold text-sm">MINIMARKET EL BUEN VECINO</p>
                <p className="text-[10px] text-slate-500">RUC: 20100055237 · Boleta de Venta</p>
                <p className="font-bold text-emerald-700 mt-1">{ticketVenta.numero_ticket}</p>
              </div>

              <div className="flex justify-between text-[11px]">
                <span>Total Ítems:</span>
                <span>{ticketVenta.items_procesados}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Subtotal:</span>
                <span>S/ {Number(ticketVenta.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>IGV (18%):</span>
                <span>S/ {Number(ticketVenta.igv).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-dashed border-slate-300 pt-1 text-slate-900">
                <span>TOTAL:</span>
                <span>S/ {Number(ticketVenta.total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Vuelto:</span>
                <span>S/ {Number(ticketVenta.vuelto).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 border border-slate-300 hover:bg-slate-100 font-semibold py-2.5 rounded-xl text-slate-700 text-sm flex items-center justify-center space-x-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={handleCerrarTodo}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-sm shadow-md shadow-emerald-600/20"
              >
                Nueva Venta
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
