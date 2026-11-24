import React, { useState } from 'react';
import { X } from 'lucide-react';
import { inventarioService } from '../../services/api';

interface StockAjusteModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: { id: number; nombre: string; stock_actual: number } | null;
  onSuccess: () => void;
}

export const StockAjusteModal: React.FC<StockAjusteModalProps> = ({
  isOpen,
  onClose,
  producto,
  onSuccess,
}) => {
  if (!isOpen || !producto) return null;

  const [cantidad, setCantidad] = useState<number>(1);
  const [tipo, setTipo] = useState<'ajuste_positivo' | 'ajuste_negativo' | 'compra'>('compra');
  const [motivo, setMotivo] = useState<string>('Reabastecimiento por proveedor');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const delta = tipo === 'ajuste_negativo' ? -Math.abs(cantidad) : Math.abs(cantidad);
      await inventarioService.ajustarStock({
        producto_id: producto.id,
        cantidad: delta,
        tipo,
        motivo,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al registrar ajuste de stock.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="glass card max-w-md w-full p-6 shadow-pop animate-pop border border-line">
        <div className="flex justify-between items-center border-b border-line pb-3 mb-4">
          <h3 className="font-display font-bold text-base text-ink">Ajuste de Stock / Kardex</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-ink-muted hover:text-ink hover:bg-surface-3 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="card bg-surface-2 p-3 border-line">
            <span className="text-[11px] text-ink-faint uppercase font-semibold">Producto</span>
            <p className="font-bold text-ink text-sm mt-0.5">{producto.nombre}</p>
            <p className="text-xs text-brand-500 font-medium mt-0.5">
              Stock actual: <span className="font-mono font-bold">{producto.stock_actual}</span> unidades
            </p>
          </div>

          {error && (
            <div className="p-2.5 bg-danger-soft border border-danger/30 text-danger text-xs rounded-chip text-center font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="label mb-1">Tipo de Movimiento</label>
            <select
              value={tipo}
              onChange={(e: any) => setTipo(e.target.value)}
              className="w-full text-xs font-medium"
            >
              <option value="compra">Compra / Entrada de Proveedor (+)</option>
              <option value="ajuste_positivo">Ajuste Positivo por Conteo Físico (+)</option>
              <option value="ajuste_negativo">Merma / Descarte / Ajuste Negativo (-)</option>
            </select>
          </div>

          <div>
            <label className="label mb-1">Cantidad de Unidades</label>
            <input
              type="number"
              min="1"
              required
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="w-full font-display text-kpi text-center font-bold"
            />
          </div>

          <div>
            <label className="label mb-1">Motivo / Justificación</label>
            <input
              type="text"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Ingreso de factura 001-230 o merma por rotura"
              className="w-full text-xs"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 h-12 text-xs">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 h-12 shadow-hero text-xs font-bold"
            >
              {loading ? 'Guardando...' : 'Confirmar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
