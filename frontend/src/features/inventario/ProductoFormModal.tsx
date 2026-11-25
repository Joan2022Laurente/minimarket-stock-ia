import React, { useState, useEffect } from 'react';
import { X, PackagePlus, Upload, CheckCircle2 } from 'lucide-react';
import { productoService } from '../../services/api';
import { Categoria, Producto } from '../../types/producto';

interface ProductoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto?: Producto | null;
  onSuccess: () => void;
}

export const ProductoFormModal: React.FC<ProductoFormModalProps> = ({
  isOpen,
  onClose,
  producto,
  onSuccess,
}) => {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [codigoBarras, setCodigoBarras] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoriaId, setCategoriaId] = useState<number>(1);
  const [precioCosto, setPrecioCosto] = useState<string>('1.00');
  const [precioVenta, setPrecioVenta] = useState<string>('2.00');
  const [stockActual, setStockActual] = useState<string>('10');
  const [stockMinimo, setStockMinimo] = useState<string>('5');
  const [stockSeguridad, setStockSeguridad] = useState<string>('10');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    productoService.getCategorias().then(setCategorias).catch(() => {});
    setError(null);
    setUploadInfo(null);
    setSelectedFile(null);

    if (producto) {
      setCodigoBarras(producto.codigo_barras);
      setNombre(producto.nombre);
      setCategoriaId(producto.categoria_id || 1);
      setPrecioCosto(String(producto.precio_costo ?? '1.00'));
      setPrecioVenta(String(producto.precio_venta ?? '2.00'));
      setStockActual(String(producto.stock_actual ?? '0'));
      setStockMinimo(String(producto.stock_minimo ?? '5'));
      setStockSeguridad(String(producto.stock_seguridad ?? '10'));
    } else {
      setCodigoBarras('');
      setNombre('');
      setCategoriaId(1);
      setPrecioCosto('2.50');
      setPrecioVenta('3.50');
      setStockActual('20');
      setStockMinimo('5');
      setStockSeguridad('10');
    }
  }, [isOpen, producto]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let savedId = producto?.id;
      if (producto) {
        await productoService.update(producto.id, {
          codigo_barras: codigoBarras,
          nombre,
          categoria_id: Number(categoriaId),
          precio_costo: Number(precioCosto),
          precio_venta: Number(precioVenta),
          stock_minimo: Number(stockMinimo),
          stock_seguridad: Number(stockSeguridad),
        });
      } else {
        const created = await productoService.create({
          codigo_barras: codigoBarras,
          nombre,
          categoria_id: Number(categoriaId),
          precio_costo: Number(precioCosto),
          precio_venta: Number(precioVenta),
          stock_actual: Number(stockActual),
          stock_minimo: Number(stockMinimo),
          stock_seguridad: Number(stockSeguridad),
          activo: true,
        });
        savedId = created.id;
      }

      if (selectedFile && savedId) {
        const imgRes = await productoService.uploadImage(savedId, selectedFile);
        setUploadInfo(`Imagen subida (${imgRes.storage}): ${imgRes.s3_key}`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No se pudo guardar el producto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] rounded-card border border-white/[0.1] max-w-lg w-full p-7 shadow-2xl animate-pop text-white">
        <div className="flex justify-between items-center pb-4 border-b border-white/[0.08] mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#FF4A15]/20 text-[#FF4A15] flex items-center justify-center">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">
                {producto ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <p className="text-xs text-[#8E8E93]">Gestión de catálogo SKU e imagen S3</p>
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

        {error && (
          <div className="mb-4 p-3 bg-[#FF4D6A]/15 border border-[#FF4D6A]/30 rounded-xl text-[#FF4D6A] text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#8E8E93] mb-1 block">
                Código de Barras
              </label>
              <input
                type="text"
                required
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                placeholder="7750000000001"
                className="w-full h-11 px-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs font-mono text-white focus:outline-none focus:border-white/30"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8E8E93] mb-1 block">Categoría</label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(Number(e.target.value))}
                className="w-full h-11 px-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white focus:outline-none focus:border-white/30"
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#8E8E93] mb-1 block">
              Nombre del Producto
            </label>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Leche Gloria 400g"
              className="w-full h-11 px-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#8E8E93] mb-1 block">Costo (S/)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={precioCosto}
                onChange={(e) => setPrecioCosto(e.target.value)}
                className="w-full h-11 px-3 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs font-mono text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#8E8E93] mb-1 block">Venta (S/)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={precioVenta}
                onChange={(e) => setPrecioVenta(e.target.value)}
                className="w-full h-11 px-3 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs font-mono text-white focus:outline-none"
              />
            </div>
            {!producto && (
              <div>
                <label className="text-xs font-semibold text-[#8E8E93] mb-1 block">Stock Ini.</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={stockActual}
                  onChange={(e) => setStockActual(e.target.value)}
                  className="w-full h-11 px-3 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs font-mono text-white focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-[#8E8E93] mb-1 block">Mínimo</label>
              <input
                type="number"
                min="0"
                required
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
                className="w-full h-11 px-3 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs font-mono text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#8E8E93] mb-1.5 block">
              Imagen del Producto (S3)
            </label>
            <label className="flex items-center justify-center gap-2 h-12 px-4 rounded-tile bg-[#1C1C1F] border border-dashed border-white/[0.15] hover:border-[#FF4A15]/60 cursor-pointer text-xs text-[#8E8E93] hover:text-white transition-colors">
              <Upload className="w-4 h-4 text-[#FF4A15]" />
              <span>{selectedFile ? selectedFile.name : 'Seleccionar JPG, PNG o WEBP (Opcional)'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </label>
            {uploadInfo && (
              <p className="text-[11px] text-[#34D399] mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{uploadInfo}</span>
              </p>
            )}
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
              className="flex-1 h-12 rounded-full bg-[#FF4A15] hover:bg-[#E63900] text-white text-xs font-extrabold shadow-lg shadow-[#FF4A15]/30 disabled:opacity-40"
            >
              {loading ? 'Guardando...' : producto ? 'Guardar Cambios' : 'Crear Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
