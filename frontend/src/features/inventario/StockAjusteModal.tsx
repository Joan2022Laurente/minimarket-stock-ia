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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] rounded-card border border-white/[0.12] max-w-md w-full p-7 animate-pop text-white">
        <div className="flex justify-between items-center pb-3 border-b border-white/[0.08] mb-4">
          <h3 className="font-extrabold text-base text-white">Ajuste de Stock / Kardex</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1C1C1F] border border-white/[0.08] flex items-center justify-center text-[#8E8E93] hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-[#1C1C1F] p-4 rounded-tile border border-white/[0.06]">
            <span className="text-[11px] text-[#8E8E93] uppercase font-bold tracking-wider">Producto</span>
            <p className="font-bold text-white text-sm mt-0.5">{producto.nombre}</p>
            <p className="text-xs text-[#FF4A15] font-semibold mt-1">
              Stock actual: <span className="font-mono font-bold text-white">{producto.stock_actual}</span> unidades
            </p>
          </div>

          {error && (
            <div className="p-2.5 bg-[#FF4D6A]/20 border border-[#FF4D6A]/30 text-[#FF4D6A] text-xs rounded-xl text-center font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-[#8E8E93] mb-1.5 block">Tipo de Movimiento</label>
            <select
              value={tipo}
              onChange={(e: any) => setTipo(e.target.value)}
              className="w-full h-11 px-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs font-semibold text-white focus:outline-none focus:border-white/30"
            >
              <option value="compra">Compra / Entrada de Proveedor (+)</option>
              <option value="ajuste_positivo">Ajuste Positivo por Conteo Físico (+)</option>
              <option value="ajuste_negativo">Merma / Descarte / Ajuste Negativo (-)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#8E8E93] mb-1.5 block">Cantidad de Unidades</label>
            <input
              type="number"
              min="1"
              required
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="w-full h-12 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-center text-xl font-mono font-bold text-white focus:outline-none focus:border-[#FF4A15]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#8E8E93] mb-1.5 block">Motivo / Justificación</label>
            <input
              type="text"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Factura F001-230 o merma física"
              className="w-full h-11 px-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="flex gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-full bg-[#1C1C1F] border border-white/[0.08] text-xs font-bold text-[#8E8E93] hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-12 rounded-full bg-[#FF4A15] hover:bg-[#E63900] text-white text-xs font-extrabold"
            >
              {loading ? 'Guardando...' : 'Confirmar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
