import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  AlertCircle,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { productoService } from '../../services/api';
import { useCartStore } from '../../stores/useCartStore';
import { Producto, Categoria } from '../../types/producto';
import { PaymentModal } from './PaymentModal';

export const POSPage: React.FC = () => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [selectedCategoria, setSelectedCategoria] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const { items, addItem, updateQuantity, clearCart, getTotal, getSubtotal, getIgv, getItemsCount } =
    useCartStore();

  useEffect(() => {
    loadData();
    barcodeInputRef.current?.focus();
  }, []);

  // Atajo F2 para cobrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (items.length > 0) {
          setIsPaymentOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items]);

  const loadData = async (catId?: number, query?: string) => {
    try {
      setLoading(true);
      const [prodsData, catsData] = await Promise.all([
        productoService.list(catId, query),
        productoService.getCategorias(),
      ]);
      setProductos(prodsData);
      setCategorias(catsData);
    } catch (err) {
      console.error('Error cargando catálogo:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    loadData(selectedCategoria || undefined, val);
  };

  const handleCategoriaSelect = (catId: number | null) => {
    setSelectedCategoria(catId);
    loadData(catId || undefined, search || undefined);
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBarcodeError(null);
    if (!barcodeInput.trim()) return;

    const prod = productos.find((p) => p.codigo_barras === barcodeInput.trim());
    if (prod) {
      if (prod.stock_actual <= 0) {
        setBarcodeError(`«${prod.nombre}» no tiene stock disponible.`);
      } else {
        triggerAddItem(prod);
        setBarcodeInput('');
      }
    } else {
      setBarcodeError(`Código "${barcodeInput}" no encontrado.`);
    }
  };

  const triggerAddItem = (prod: Producto) => {
    addItem(prod, 1);
    setJustAddedId(prod.id);
    setTimeout(() => setJustAddedId(null), 350);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 min-h-[calc(100vh-7rem)]">
      {/* Columna Izquierda: Búsqueda y Catálogo de Productos del Minimarket */}
      <div className="flex flex-col gap-5">
        {/* Barra de Filtros y Entradas */}
        <div className="bg-[#141416] rounded-[28px] border border-white/[0.08] p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight">
                Punto de Venta / Caja
              </h2>
              <p className="text-xs text-[#8E8E93]">Catálogo de productos de alta rotación</p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#1C1C1F] text-[#34D399] border border-white/[0.06]">
              ● Caja Abierta
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Buscador de Producto */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#8E8E93] absolute left-4 top-3.5" />
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="Buscar por nombre..."
                className="w-full h-11 pl-11 pr-4 bg-[#1C1C1F] border border-white/[0.08] rounded-full text-xs text-white placeholder-[#5C5C62] focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Escáner de Código de Barras */}
            <form onSubmit={handleBarcodeSubmit} className="relative">
              <ScanBarcode className="w-4 h-4 text-[#FF4A15] absolute left-4 top-3.5" />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Escanear código de barras..."
                className="w-full h-11 pl-11 pr-4 bg-[#1C1C1F] border border-[#FF4A15]/60 rounded-full text-xs font-mono text-white placeholder-[#5C5C62] focus:outline-none focus:border-[#FF4A15]"
              />
            </form>
          </div>

          {barcodeError && (
            <div className="flex items-center gap-2 p-2.5 bg-[#FF4D6A]/15 border border-[#FF4D6A]/30 rounded-xl text-[#FF4D6A] text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{barcodeError}</span>
            </div>
          )}

          {/* Pestañas de Categorías estilo FinPoint Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
            <button
              onClick={() => handleCategoriaSelect(null)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategoria === null
                  ? 'bg-white text-black shadow-md'
                  : 'bg-[#1C1C1F] text-[#8E8E93] border border-white/[0.06] hover:text-white'
              }`}
            >
              Todos ({productos.length})
            </button>
            {categorias.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoriaSelect(cat.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  selectedCategoria === cat.id
                    ? 'bg-white text-black shadow-md'
                    : 'bg-[#1C1C1F] text-[#8E8E93] border border-white/[0.06] hover:text-white'
                }`}
              >
                {cat.nombre}
              </button>
            ))}
          </div>
        </div>

        {/* Cuadrícula de Productos */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="p-12 text-center text-[#8E8E93] text-sm">Cargando catálogo...</div>
          ) : productos.length === 0 ? (
            <div className="bg-[#141416] rounded-[28px] border border-white/[0.08] p-12 text-center text-[#8E8E93] text-sm">
              No se encontraron productos coincidentes.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {productos.map((prod) => {
                const out = prod.stock_actual <= 0;
                const justAdded = justAddedId === prod.id;

                return (
                  <button
                    key={prod.id}
                    disabled={out}
                    onClick={() => triggerAddItem(prod)}
                    className={`group relative flex flex-col justify-between min-h-[148px] p-4 text-left rounded-[24px] border transition-all duration-150 ${
                      out
                        ? 'bg-[#141416] border-white/[0.04] opacity-50 cursor-not-allowed bg-hatch-pattern'
                        : justAdded
                        ? 'bg-[#1C1C1F] border-[#FF4A15] shadow-[0_0_20px_rgba(255,74,21,0.3)] scale-[0.98]'
                        : 'bg-[#141416] border-white/[0.08] hover:bg-[#1C1C1F] hover:border-white/20 hover:-translate-y-1'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider truncate">
                          {prod.categoria_nombre || 'General'}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                            prod.stock_actual <= 0
                              ? 'bg-[#FF4D6A]/20 text-[#FF4D6A]'
                              : prod.stock_actual <= 5
                              ? 'bg-[#FFD21F]/20 text-[#FFD21F]'
                              : 'bg-[#34D399]/20 text-[#34D399]'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>{prod.stock_actual} u</span>
                        </span>
                      </div>

                      <h4 className="mt-2 text-xs sm:text-sm font-bold text-white group-hover:text-[#FF4A15] transition-colors line-clamp-2 leading-snug">
                        {prod.nombre}
                      </h4>
                    </div>

                    <div className="mt-4 flex items-baseline justify-between pt-2.5 border-t border-white/[0.04]">
                      <span className="text-base sm:text-lg font-extrabold text-white font-sans">
                        S/ {Number(prod.precio_venta).toFixed(2)}
                      </span>
                      {out ? (
                        <span className="text-[10px] font-bold text-[#FF4D6A] uppercase">Agotado</span>
                      ) : (
                        <span className="w-7 h-7 rounded-full bg-[#1C1C1F] border border-white/10 flex items-center justify-center text-[#8E8E93] group-hover:bg-[#FF4A15] group-hover:text-white transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Columna Derecha: Carrito de Compras en Tarjeta FinPoint */}
      <aside className="sticky top-20 flex h-[calc(100vh-6.5rem)] flex-col justify-between bg-[#141416] rounded-[28px] border border-white/[0.08] p-6 shadow-card text-white">
        {/* Cabecera del Carrito */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#1C1C1F] border border-white/[0.08] flex items-center justify-center text-[#FF4A15]">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Venta Actual</h3>
                <p className="text-xs text-[#8E8E93]">{getItemsCount()} productos agregados</p>
              </div>
            </div>

            {items.length > 0 && (
              <button
                onClick={clearCart}
                title="Vaciar carrito"
                className="w-8 h-8 rounded-full bg-[#1C1C1F] border border-white/[0.08] flex items-center justify-center text-[#8E8E93] hover:text-[#FF4D6A] transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Total Destacado */}
          <div className="py-5">
            <span className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider block">
              Total a Cobrar (IGV 18% incl.)
            </span>
            <div className="text-4xl sm:text-5xl font-extrabold text-white font-sans mt-1">
              S/ {getTotal().toFixed(2)}
            </div>
          </div>
        </div>

        {/* Lista de Ítems en Carrito */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-2">
          {items.length === 0 ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center p-6 text-center rounded-[20px] bg-[#1C1C1F] bg-hatch-pattern border border-white/[0.04]">
              <Store className="w-8 h-8 text-[#5C5C62] mb-2" />
              <p className="font-bold text-xs text-white">Carrito Vacío</p>
              <p className="text-[11px] text-[#8E8E93] mt-0.5">
                Escanee un código o seleccione del catálogo
              </p>
            </div>
          ) : (
            items.map((it) => (
              <div
                key={it.producto.id}
                className="bg-[#1C1C1F] rounded-[18px] p-3 border border-white/[0.04] flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-xs text-white truncate">{it.producto.nombre}</p>
                  <p className="text-[11px] text-[#8E8E93] font-mono mt-0.5">
                    S/ {Number(it.producto.precio_venta).toFixed(2)} c/u
                  </p>
                </div>

                {/* Controles de Cantidad */}
                <div className="flex items-center gap-1 bg-[#141416] rounded-full p-1 border border-white/[0.06]">
                  <button
                    onClick={() => updateQuantity(it.producto.id, it.cantidad - 1)}
                    className="w-5 h-5 rounded-full bg-[#1C1C1F] hover:bg-[#26262B] flex items-center justify-center text-white text-xs"
                  >
                    <Minus className="w-2.5 h-2.5" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold font-mono text-white">
                    {it.cantidad}
                  </span>
                  <button
                    onClick={() => updateQuantity(it.producto.id, it.cantidad + 1)}
                    disabled={it.cantidad >= it.producto.stock_actual}
                    className="w-5 h-5 rounded-full bg-[#1C1C1F] hover:bg-[#26262B] flex items-center justify-center text-white text-xs disabled:opacity-30"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>

                <span className="font-extrabold text-xs sm:text-sm text-white font-mono w-16 text-right">
                  S/ {(it.producto.precio_venta * it.cantidad).toFixed(2)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Resumen Financiero y Botón Cobrar */}
        <div className="pt-4 border-t border-white/[0.06] space-y-3">
          <div className="flex justify-between text-xs text-[#8E8E93] font-mono">
            <span>Subtotal: S/ {getSubtotal().toFixed(2)}</span>
            <span>IGV (18%): S/ {getIgv().toFixed(2)}</span>
          </div>

          <button
            disabled={items.length === 0}
            onClick={() => setIsPaymentOpen(true)}
            className="w-full h-14 rounded-full bg-[#FF4A15] hover:bg-[#E63900] text-white font-extrabold text-sm transition-all shadow-lg shadow-[#FF4A15]/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-4 h-4" />
            <span>COBRAR VENTA (F2)</span>
          </button>
        </div>
      </aside>

      {/* Modal de Cobro */}
      <PaymentModal isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} />
    </div>
  );
};
