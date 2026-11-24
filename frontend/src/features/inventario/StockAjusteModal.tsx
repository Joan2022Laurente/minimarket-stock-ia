import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <h3 className="font-bold text-base">Ajuste de Stock / Kardex</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <span className="text-xs text-slate-500 uppercase font-semibold">Producto</span>
            <p className="font-bold text-slate-800 text-sm mt-0.5">{producto.nombre}</p>
            <p className="text-xs text-emerald-600 font-medium">Stock actual: {producto.stock_actual} unidades</p>
          </div>

          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Movimiento</label>
            <select
              value={tipo}
              onChange={(e: any) => setTipo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            >
              <option value="compra">Compra / Entrada de Proveedor (+)</option>
              <option value="ajuste_positivo">Ajuste Positivo por Inventario Físico (+)</option>
              <option value="ajuste_negativo">Merma / Descarte / Ajuste Negativo (-)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad de Unidades</label>
            <input
              type="number"
              min="1"
              required
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo / Justificación</label>
            <input
              type="text"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Factura F001-234 o Merma por vencimiento"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-600/20"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Guardando...' : 'Guardar Ajuste'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
