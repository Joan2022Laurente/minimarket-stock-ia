import React, { useState, useEffect } from 'react';
import { DollarSign, Smartphone, CreditCard, X, Printer, CheckCircle2, CloudUpload } from 'lucide-react';
import { ventaService } from '../../services/api';
import { useCartStore } from '../../stores/useCartStore';
import { VentaResponse } from '../../types/venta';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleSuccess?: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSaleSuccess }) => {
  const { items, getTotal, clearCart } = useCartStore();
  const [metodo, setMetodo] = useState<'efectivo' | 'yape_plin' | 'tarjeta'>('efectivo');
  const [montoPagado, setMontoPagado] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketVenta, setTicketVenta] = useState<VentaResponse | null>(null);
  const [ticketItems, setTicketItems] = useState<{ nombre: string; cantidad: number; subtotal: number }[]>([]);
  const [s3Status, setS3Status] = useState<string | null>(null);
  const [backingUpS3, setBackingUpS3] = useState(false);

  const total = getTotal();

  useEffect(() => {
    if (isOpen && !ticketVenta) {
      setMetodo('efectivo');
      setMontoPagado(total);
      setError(null);
      setS3Status(null);
    }
  }, [isOpen, total, ticketVenta]);

  if (!isOpen) return null;

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
      onSaleSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al procesar la venta en caja.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackupS3 = async () => {
    if (!ticketVenta) return;
    setBackingUpS3(true);
    try {
      const res = await ventaService.backupReceiptS3(ticketVenta.venta_id);
      setS3Status(`Respaldado (${res.storage}): ${res.s3_key}`);
    } catch {
      setS3Status('No se pudo respaldar el comprobante.');
    } finally {
      setBackingUpS3(false);
    }
  };

  const handleCerrarTodo = () => {
    setTicketVenta(null);
    setS3Status(null);
    onClose();
  };

  const quickBills = [10, 20, 50, 100, 200];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] rounded-card border border-white/[0.1] max-w-lg w-full p-7 shadow-2xl animate-pop text-white">
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
                className={`h-14 rounded-tile font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all ${
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
                className={`h-14 rounded-tile font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all ${
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
                className={`h-14 rounded-tile font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all ${
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
            <div className="bg-[#1C1C1F] rounded-tile border border-white/[0.06] text-center py-5">
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
                <div className="flex justify-between items-center p-3.5 rounded-tile bg-[#1C1C1F] border border-white/[0.06]">
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
          /* Pop-up de Venta Realizada con Éxito */
          <div className="space-y-4">
            <div className="p-4 rounded-tile bg-[#34D399]/15 border border-[#34D399]/30 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#34D399] text-black flex items-center justify-center shrink-0 shadow-md">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="font-extrabold text-sm text-[#34D399]">
                  ¡Venta realizada con éxito!
                </p>
                <p className="text-[11px] text-[#8E8E93] mt-0.5">
                  Ticket {ticketVenta.numero_ticket} · Stock actualizado atómicamente
                </p>
              </div>
            </div>

            <div className="bg-white text-slate-900 rounded-tile p-5 font-mono text-xs space-y-2 shadow-inner">
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
                    <span className="font-bold">S/ {Number(it.subtotal).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-1 space-y-0.5 text-xs">
                <div className="flex justify-between font-bold text-sm">
                  <span>TOTAL:</span>
                  <span>S/ {Number(ticketVenta.total).toFixed(2)}</span>
                </div>
                {Number(ticketVenta.vuelto ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold text-xs">
                    <span>VUELTO:</span>
                    <span>S/ {Number(ticketVenta.vuelto).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {s3Status && (
              <div className="p-2.5 rounded-xl bg-[#1C1C1F] border border-[#34D399]/30 text-[11px] text-[#34D399] font-mono text-center">
                {s3Status}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleBackupS3}
                disabled={backingUpS3}
                className="h-12 px-4 rounded-full bg-[#1C1C1F] border border-white/[0.08] text-xs font-bold text-white flex items-center justify-center gap-1.5 hover:border-white/30 disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4 text-[#FF4A15]" />
                <span>{backingUpS3 ? 'Subiendo...' : 'S3'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 h-12 rounded-full bg-[#1C1C1F] border border-white/[0.08] text-xs font-bold text-white flex items-center justify-center gap-2 hover:border-white/30"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={handleCerrarTodo}
                className="flex-1 h-12 rounded-full bg-white text-black text-xs font-extrabold shadow-lg hover:bg-neutral-100"
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
