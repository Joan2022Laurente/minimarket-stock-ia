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
  const [ticketItems, setTicketItems] = useState<{ nombre: string; cantidad: number; subtotal: number }[]>([]);

  if (!isOpen) return null;

  const total = getTotal();
  const vuelto = metodo === 'efectivo' ? Math.max(0, Number((montoPagado - total).toFixed(2))) : 0;
  const saldoInsuficiente = metodo === 'efectivo' && montoPagado < total;

  const handleCobrar = async () => {
    setError(null);
    if (metodo === 'efectivo' && montoPagado < total) {
      setError('El monto pagado en efectivo no puede ser menor al total.');
      return;
    }

    setLoading(true);
    try {
      const itemsPayload = items.map((i) => ({
        producto_id: i.producto.id,
        cantidad: i.cantidad,
      }));

      const cachedTicketItems = items.map((i) => ({
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        subtotal: i.subtotal,
      }));

      const payload = {
        metodo_pago: metodo,
        monto_pagado: metodo === 'efectivo' ? montoPagado : total,
        items: itemsPayload,
      };

      const res = await ventaService.checkout(payload);
      setTicketItems(cachedTicketItems);
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

  const quickBills = [10, 20, 50, 100, 200];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="glass card max-w-lg w-full p-6 shadow-pop animate-pop border border-line">
        {/* Cabecera del Modal */}
        <div className="flex justify-between items-center border-b border-line pb-4 mb-5">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">
              {ticketVenta ? 'Venta Completada' : 'Finalizar Venta'}
            </h3>
            <p className="text-xs text-ink-muted">
              {ticketVenta ? 'Comprobante emitido exitosamente' : 'Seleccione el método de pago y registre el cobro'}
            </p>
          </div>
          <button
            onClick={handleCerrarTodo}
            className="p-1.5 rounded-full text-ink-muted hover:text-ink hover:bg-surface-3 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger-soft border border-danger/30 rounded-chip text-danger text-xs font-medium">
            {error}
          </div>
        )}

        {!ticketVenta ? (
          <div className="space-y-5">
            {/* Selector de Método de Pago en Píldoras */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMetodo('efectivo');
                  setMontoPagado(total);
                }}
                className={`h-14 rounded-tile font-semibold text-xs flex flex-col items-center justify-center gap-1 transition ${
                  metodo === 'efectivo'
                    ? 'bg-ink text-canvas shadow-sm'
                    : 'bg-surface-2 text-ink-muted border border-line hover:text-ink hover:bg-surface-3'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>Efectivo</span>
              </button>

              <button
                type="button"
                onClick={() => setMetodo('yape_plin')}
                className={`h-14 rounded-tile font-semibold text-xs flex flex-col items-center justify-center gap-1 transition ${
                  metodo === 'yape_plin'
                    ? 'bg-ink text-canvas shadow-sm'
                    : 'bg-surface-2 text-ink-muted border border-line hover:text-ink hover:bg-surface-3'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Yape / Plin</span>
              </button>

              <button
                type="button"
                onClick={() => setMetodo('tarjeta')}
                className={`h-14 rounded-tile font-semibold text-xs flex flex-col items-center justify-center gap-1 transition ${
                  metodo === 'tarjeta'
                    ? 'bg-ink text-canvas shadow-sm'
                    : 'bg-surface-2 text-ink-muted border border-line hover:text-ink hover:bg-surface-3'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Tarjeta</span>
              </button>
            </div>

            {/* Total a pagar */}
            <div className="card bg-surface-2 border-line text-center py-4">
              <span className="label text-ink-muted">Total a Pagar</span>
              <div className="font-display text-total font-bold text-ink tabular-nums mt-1">
                S/ {total.toFixed(2)}
              </div>
            </div>

            {/* Opciones Específicas para Efectivo */}
            {metodo === 'efectivo' && (
              <div className="space-y-3">
                <div>
                  <label className="label mb-1.5">Monto Recibido en Efectivo (S/)</label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={montoPagado || ''}
                    onChange={(e) => setMontoPagado(Number(e.target.value))}
                    className="w-full font-display text-kpi text-center tabular-nums"
                  />
                </div>

                {/* Chips de Billetes Rápidos */}
                <div className="flex gap-1.5 justify-center flex-wrap">
                  {quickBills.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setMontoPagado(b)}
                      className="btn-ghost h-10 px-3.5 text-xs font-mono font-semibold"
                    >
                      S/ {b}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMontoPagado(total)}
                    className="btn-ghost h-10 px-3.5 text-xs font-semibold text-brand-500 border-brand-500/30"
                  >
                    Exacto
                  </button>
                </div>

                {/* Vuelto / Saldo */}
                <div className="flex justify-between items-center p-3 rounded-tile bg-surface-2 border border-line">
                  <span className="text-xs text-ink-muted font-medium">
                    {saldoInsuficiente ? 'Faltante:' : 'Vuelto a Entregar:'}
                  </span>
                  <span
                    className={`pill text-sm font-bold h-8 px-4 ${
                      saldoInsuficiente ? 'bg-danger-soft text-danger' : 'bg-success text-on-light'
                    }`}
                  >
                    S/ {saldoInsuficiente ? (total - montoPagado).toFixed(2) : vuelto.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-ghost flex-1 h-14">
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading || saldoInsuficiente}
                onClick={handleCobrar}
                className="btn-primary flex-2 h-14 shadow-hero text-base font-bold disabled:opacity-40"
              >
                {loading ? 'Procesando Venta...' : 'Confirmar Cobro (Enter)'}
              </button>
            </div>
          </div>
        ) : (
          /* Vista del Ticket Emitido sobre Papel Blanco Fijo */
          <div className="space-y-5 animate-pop">
            <div className="flex items-center gap-2 text-success font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>Transacción registrada en Supabase</span>
            </div>

            {/* Ticket de Papel Térmico Blanco */}
            <div className="bg-white text-slate-900 rounded-tile p-5 shadow-inner font-mono text-xs space-y-2 border border-slate-200">
              <div className="text-center border-b border-slate-300 pb-2">
                <h4 className="font-bold text-sm tracking-tight">MINIMARKET EL BUEN VECINO</h4>
                <p className="text-[10px] text-slate-500">RUC: 20123456789</p>
                <p className="text-[10px] text-slate-500">BOLETA DE VENTA ELECTRÓNICA</p>
                <p className="font-bold text-xs mt-1 text-slate-800">{ticketVenta.numero_ticket}</p>
              </div>

              <div className="space-y-1 py-2 border-b border-slate-300 text-[11px]">
                {ticketItems.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate max-w-[180px]">
                      {it.cantidad}x {it.nombre}
                    </span>
                    <span className="font-bold tabular-nums">S/ {it.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-0.5 pt-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>S/ {ticketVenta.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IGV (18%):</span>
                  <span>S/ {ticketVenta.igv.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-slate-400 pt-1">
                  <span>TOTAL:</span>
                  <span>S/ {ticketVenta.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-ghost flex-1 h-12 flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket</span>
              </button>
              <button
                type="button"
                onClick={handleCerrarTodo}
                className="btn-primary flex-1 h-12 shadow-hero font-bold"
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
