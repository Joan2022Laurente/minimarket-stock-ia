import React, { useState, useEffect } from 'react';
import { X, PackageCheck } from 'lucide-react';
import { inventarioService } from '../../../services/api';
import { PrediccionItem } from '../../../types/prediccion';

interface ReposicionRapidaModalProps {
  item: PrediccionItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReposicionRapidaModal: React.FC<ReposicionRapidaModalProps> = ({
  item,
  onClose,
  onSuccess,
}) => {
  const [cantidad, setCantidad] = useState<number>(0);
  const [motivo, setMotivo] = useState('Reposición sugerida por modelo IA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setCantidad(Math.max(1, Number(item.cantidad_sugerida || 1)));
      setMotivo('Reposición sugerida por modelo IA');
      setError(null);
    }
  }, [item]);

  if (!item) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cantidad <= 0) {
      setError('La cantidad a ingresar debe ser mayor a 0.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await inventarioService.ajustarStock({
        producto_id: item.producto_id,
        cantidad,
        tipo: 'compra',
        motivo,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No se pudo registrar la reposición.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] rounded-card border border-white/[0.12] max-w-md w-full p-7 animate-pop text-white">
        <div className="flex justify-between items-center pb-4 border-b border-white/[0.08] mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#FF4A15] text-white flex items-center justify-center">
              <PackageCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Registrar Compra Sugerida</h3>
              <p className="text-xs text-[#8E8E93]">Ingreso directo al Kardex de inventario</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1C1C1F] border border-white/[0.08] flex items-center justify-center text-[#8E8E93] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="p-4 rounded-tile bg-[#1C1C1F] border border-white/[0.06] space-y-1">
            <p className="font-bold text-sm text-white">{item.producto_nombre}</p>
            <div className="flex justify-between text-xs text-[#8E8E93] font-mono pt-1">
              <span>Stock actual: {item.stock_actual} u</span>
              <span>Punto de reorden: {Number(item.punto_reorden ?? 0).toFixed(0)} u</span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-[#FF4D6A]/15 border border-[#FF4D6A]/30 rounded-xl text-[#FF4D6A] text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-[#8E8E93] mb-1.5 block">
              Unidades a Ingresar (Sugerido IA: +{item.cantidad_sugerida} u)
            </label>
            <input
              type="number"
              min="1"
              required
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="w-full h-12 bg-[#1C1C1F] border border-white/[0.1] rounded-full text-center text-xl font-extrabold font-mono text-white focus:outline-none focus:border-[#FF4A15]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#8E8E93] mb-1.5 block">
              Motivo / Referencia
            </label>
            <input
              type="text"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full h-11 px-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="flex gap-3 pt-2">
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
              className="flex-1 h-12 rounded-full bg-[#FF4A15] hover:bg-[#E63900] text-white text-xs font-extrabold disabled:opacity-40"
            >
              {loading ? 'Registrando...' : 'Confirmar Ingreso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
