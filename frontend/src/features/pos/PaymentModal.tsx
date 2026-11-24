import React, { useState } from 'react';
import { DollarSign, Smartphone, CreditCard, X, Printer, CheckCircle2 } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] rounded-[28px] border border-white/[0.1] max-w-lg w-full p-7 shadow-2xl animate-pop text-white">
        {/* Cabecera */}
        <div className="flex justify-between items-center pb-4 border-b border-white/[0.08] mb-5">
          <div>
            <h3 className="font-extrabold text-lg tracking-tight text-white">
              {ticketVenta ? 'Venta Completada' : 'Finalizar Venta'}
            </h3>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              {ticketVenta ? 'Comprobante emitido exitosamente' : 'Seleccione el método de pago y registre el cobro'}
            </p>
          </div>
          <button
            onClick={handleCerrarTodo}
            className="w-9 h-9 rounded-full bg-[#1C1C1F] border border-white/[0.08] flex items-center justify-center text-[#8E8E93] hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#FF4D6A]/15 border border-[#FF4D6A]/30 rounded-xl text-[#FF4D6A] text-xs font-semibold">
            {error}
          </div>
        )}

        {!ticketVenta ? (
          <div className="space-y-5">
            {/* 3 Métodos de pago en píldoras FinPoint */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMetodo('efectivo');
                  setMontoPagado(total);
                }}
                className={`h-14 rounded-[20px] font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all ${
                  metodo === 'efectivo'
                    ? 'bg-white text-black shadow-lg scale-100'
                    : 'bg-[#1C1C1F] text-[#8E8E93] border border-white/[0.06] hover:text-white'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>Efectivo</span>
              </button>

              <button
                type="button"
                onClick={() => setMetodo('yape_plin')}
                className={`h-14 rounded-[20px] font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all ${
                  metodo === 'yape_plin'
                    ? 'bg-white text-black shadow-lg scale-100'
                    : 'bg-[#1C1C1F] text-[#8E8E93] border border-white/[0.06] hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Yape / Plin</span>
              </button>

              <button
                type="button"
                onClick={() => setMetodo('tarjeta')}
                className={`h-14 rounded-[20px] font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all ${
                  metodo === 'tarjeta'
                    ? 'bg-white text-black shadow-lg scale-100'
                    : 'bg-[#1C1C1F] text-[#8E8E93] border border-white/[0.06] hover:text-white'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Tarjeta</span>
              </button>
            </div>

            {/* Total Grande */}
            <div className="bg-[#1C1C1F] rounded-[22px] border border-white/[0.06] text-center py-5">
              <span className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">
                Total a Pagar
              </span>
              <div className="text-4xl font-extrabold text-white font-sans mt-1">
                S/ {total.toFixed(2)}
              </div>
            </div>

            {/* Efectivo Inputs */}
            {metodo === 'efectivo' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-[#8E8E93] mb-1.5 block">
                    Monto Recibido (S/)
                  </label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={montoPagado || ''}
                    onChange={(e) => setMontoPagado(Number(e.target.value))}
                    className="w-full h-12 bg-[#1C1C1F] border border-white/[0.1] rounded-full text-center text-xl font-extrabold font-mono text-white focus:outline-none focus:border-[#FF4A15]"
                  />
                </div>

                {/* Billetes rápidos */}
                <div className="flex gap-1.5 justify-center flex-wrap">
                  {quickBills.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setMontoPagado(b)}
                      className="px-3.5 py-1.5 rounded-full bg-[#1C1C1F] border border-white/[0.08] text-xs font-mono font-bold text-white hover:border-white/30"
                    >
                      S/ {b}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMontoPagado(total)}
                    className="px-3.5 py-1.5 rounded-full bg-[#FF4A15]/20 border border-[#FF4A15]/40 text-xs font-bold text-[#FF4A15]"
                  >
                    Exacto
                  </button>
                </div>

                {/* Vuelto */}
                <div className="flex justify-between items-center p-3.5 rounded-[18px] bg-[#1C1C1F] border border-white/[0.06]">
                  <span className="text-xs text-[#8E8E93] font-semibold">
                    {saldoInsuficiente ? 'Faltante:' : 'Vuelto a Entregar:'}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-extrabold font-mono ${
                      saldoInsuficiente
                        ? 'bg-[#FF4D6A]/20 text-[#FF4D6A]'
                        : 'bg-[#34D399] text-black'
                    }`}
                  >
                    S/ {saldoInsuficiente ? (total - montoPagado).toFixed(2) : vuelto.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-full bg-[#1C1C1F] border border-white/[0.08] text-xs font-bold text-[#8E8E93] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading || saldoInsuficiente}
                onClick={handleCobrar}
                className="flex-2 h-12 rounded-full bg-[#FF4A15] hover:bg-[#E63900] text-white text-xs font-extrabold shadow-lg shadow-[#FF4A15]/30 disabled:opacity-40"
              >
                {loading ? 'Procesando Venta...' : 'Confirmar Cobro'}
              </button>
            </div>
          </div>
        ) : (
          /* Ticket Emitido en Papel Blanco */
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#34D399] font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Transacción Atómica Registrada</span>
            </div>

            <div className="bg-white text-slate-900 rounded-[20px] p-5 font-mono text-xs space-y-2 shadow-inner">
              <div className="text-center border-b border-slate-300 pb-2">
                <h4 className="font-extrabold text-sm text-slate-900">MINIMARKET EL BUEN VECINO</h4>
                <p className="text-[10px] text-slate-500">BOLETA ELECTRÓNICA: {ticketVenta.numero_ticket}</p>
              </div>

              <div className="space-y-1 py-2 border-b border-slate-300 text-[11px]">
                {ticketItems.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate max-w-[180px]">
                      {it.cantidad}x {it.nombre}
                    </span>
                    <span className="font-bold">S/ {it.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-1 flex justify-between font-bold text-sm">
                <span>TOTAL:</span>
                <span>S/ {ticketVenta.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
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
                onClick={handleCerrarTodo}
                className="flex-1 h-12 rounded-full bg-white text-black text-xs font-extrabold shadow-lg"
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
