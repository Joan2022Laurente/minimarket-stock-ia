import React, { useState, useEffect, useRef } from 'react';
import { Search, ScanBarcode, Plus, Minus, Trash2, ShoppingBag, CreditCard, AlertCircle } from 'lucide-react';
import { productoService } from '../../services/api';
import { useCartStore } from '../../stores/useCartStore';
import { Producto, Categoria } from '../../types/producto';
import { PaymentModal } from './PaymentModal';
import { StockBadge } from '../../components/ui/StockBadge';

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
      setBarcodeError(`Producto con código "${barcodeInput}" no encontrado en catálogo.`);
    }
  };

  const triggerAddItem = (prod: Producto) => {
    addItem(prod, 1);
    setJustAddedId(prod.id);
    setTimeout(() => setJustAddedId(null), 400);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-4 min-h-[calc(100vh-6rem)]">
      {/* Columna Izquierda: Catálogo y Búsqueda */}
      <div className="flex flex-col gap-4">
        {/* Barra superior de entradas: Búsqueda y Código de barras con autoenfoque */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Búsqueda por texto */}
          <div className="relative">
            <Search className="w-5 h-5 text-ink-faint absolute left-4 top-4.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Buscar por nombre de producto..."
              className="w-full h-14 pl-12 pr-4 bg-surface-2 border border-line rounded-tile text-sm"
            />
          </div>

          {/* Escáner / Código de barras */}
          <form onSubmit={handleBarcodeSubmit} className="relative">
            <ScanBarcode className="w-5 h-5 text-brand-500 absolute left-4 top-4.5 pointer-events-none" />
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Escanear código de barras (Enter)..."
              className="w-full h-14 pl-12 pr-4 bg-surface-2 border-2 border-brand-500 rounded-tile text-sm font-mono focus:shadow-focus"
            />
          </form>
        </div>

        {barcodeError && (
          <div className="flex items-center gap-2 p-3 bg-danger-soft border border-danger/30 text-danger text-xs rounded-tile font-medium animate-pop">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{barcodeError}</span>
          </div>
        )}

        {/* Pestañas de Categorías en Píldora */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 snap-x">
          <button
            onClick={() => handleCategoriaSelect(null)}
            className={`rounded-full px-4 h-9 inline-flex items-center text-xs font-semibold whitespace-nowrap transition snap-start ${
              selectedCategoria === null
                ? 'bg-ink text-canvas shadow-sm'
                : 'bg-surface-2 text-ink-muted border border-line hover:text-ink hover:bg-surface-3'
            }`}
          >
            Todos
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoriaSelect(cat.id)}
              className={`rounded-full px-4 h-9 inline-flex items-center text-xs font-semibold whitespace-nowrap transition snap-start ${
                selectedCategoria === cat.id
                  ? 'bg-ink text-canvas shadow-sm'
                  : 'bg-surface-2 text-ink-muted border border-line hover:text-ink hover:bg-surface-3'
              }`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>

        {/* Cuadrícula de Productos */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="p-12 text-center text-ink-muted text-sm font-medium">Cargando catálogo...</div>
          ) : productos.length === 0 ? (
            <div className="card p-12 text-center text-ink-muted text-sm">
              No se encontraron productos coincidentes.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {productos.map((prod) => {
                const out = prod.stock_actual <= 0;
                const justAdded = justAddedId === prod.id;

                const base =
                  'group relative flex flex-col justify-between min-h-[142px] p-4 text-left rounded-tile border transition duration-150 ease-snap';
                const state = out
                  ? 'bg-surface-2 border-line-soft opacity-60 cursor-not-allowed bg-hatch'
                  : justAdded
                  ? 'bg-surface-3 border-brand-500 shadow-focus scale-[0.99]'
                  : 'bg-surface-2 border-line-soft hover:bg-surface-3 hover:border-line hover:-translate-y-0.5 active:scale-[.98]';

                return (
                  <button
                    key={prod.id}
                    disabled={out}
                    onClick={() => triggerAddItem(prod)}
                    className={`${base} ${state}`}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <span className="label text-[11px] text-ink-faint uppercase tracking-wider truncate">
                        {prod.categoria_nombre || 'General'}
                      </span>
                      <StockBadge stock={prod.stock_actual} min={prod.stock_minimo} />
                    </div>

                    <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">
                      {prod.nombre}
                    </h3>

                    <div className="mt-3 flex items-end justify-between w-full">
                      <span className="font-display text-lg font-bold tabular-nums text-ink">
                        S/ {Number(prod.precio_venta).toFixed(2)}
                      </span>
                      {out && <span className="pill bg-danger-soft text-danger text-[10px]">Agotado</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Columna Derecha: Tarjeta Héroe del Carrito y Cobro */}
      <aside className="sticky top-20 flex h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-card bg-hero shadow-hero text-white">
        {/* Cabecera del Carrito */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-white" />
            <h2 className="font-display text-lg font-bold">Venta actual</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="pill bg-white/20 text-white font-bold">{getItemsCount()} ítems</span>
            {items.length > 0 && (
              <button
                onClick={clearCart}
                title="Vaciar carrito"
                className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Lista de Ítems */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center rounded-tile bg-black/15 bg-hatch-light border border-white/10">
              <ShoppingBag className="w-10 h-10 text-white/50 mb-3" />
              <p className="font-display font-semibold text-sm text-white">El carrito está vacío</p>
              <p className="text-xs text-white/70 mt-1 max-w-[200px]">
                Escanea un código de barras o toca un producto del catálogo.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.producto.id}
                className="flex items-center justify-between gap-3 rounded-tile bg-black/20 border border-white/10 p-3"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-xs text-white truncate leading-tight">
                    {item.producto.nombre}
                  </h4>
                  <p className="text-[11px] text-white/70 tabular-nums mt-0.5">
                    S/ {Number(item.producto.precio_venta).toFixed(2)} c/u
                  </p>
                </div>

                {/* Controles de Cantidad */}
                <div className="flex items-center gap-1.5 bg-black/20 rounded-full p-1 border border-white/10">
                  <button
                    onClick={() => updateQuantity(item.producto.id, item.cantidad - 1)}
                    className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition active:scale-95"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold font-mono text-white tabular-nums">
                    {item.cantidad}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.producto.id, item.cantidad + 1)}
                    disabled={item.cantidad >= item.producto.stock_actual}
                    className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition disabled:opacity-30 active:scale-95"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="w-18 text-right font-display font-bold text-sm text-white tabular-nums">
                  S/ {(item.producto.precio_venta * item.cantidad).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Resumen Financiero y Botón Cobrar */}
        <div className="bg-black/30 p-5 backdrop-blur-md border-t border-white/15 space-y-2">
          <div className="flex justify-between text-xs text-white/80">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">S/ {getSubtotal().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-white/80">
            <span>IGV (18%)</span>
            <span className="font-mono tabular-nums">S/ {getIgv().toFixed(2)}</span>
          </div>

          <div className="flex items-end justify-between border-t border-white/20 pt-3">
            <span className="text-sm font-medium text-white/90">Total a Pagar</span>
            <span className="font-display text-total tabular-nums text-white">
              S/ {getTotal().toFixed(2)}
            </span>
          </div>

          <button
            disabled={items.length === 0}
            onClick={() => setIsPaymentOpen(true)}
            className="btn-white mt-3 h-14 w-full text-base font-bold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <CreditCard className="w-5 h-5" />
            <span>Cobrar (F2)</span>
          </button>
        </div>
      </aside>

      {/* Modal de Pago y Cobro */}
      <PaymentModal isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} />
    </div>
  );
};
