import React, { useState, useEffect, useRef } from 'react';
import { Search, Barcode, Plus, Minus, Trash2, ShoppingBag, CreditCard, AlertCircle } from 'lucide-react';
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

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const { items, addItem, updateQuantity, clearCart, getTotal, getSubtotal, getIgv, getItemsCount } =
    useCartStore();

  // Cargar productos y categorías al montar
  useEffect(() => {
    loadData();
    barcodeInputRef.current?.focus();
  }, []);

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
    loadData(catId || undefined, search);
  };

  // Manejo de lector de código de barras
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeError(null);
    try {
      const prod = await productoService.getByBarcode(code);
      if (prod) {
        if (prod.stock_actual <= 0) {
          setBarcodeError(`Stock agotado para "${prod.nombre}".`);
        } else {
          addItem(prod, 1);
          setBarcodeInput('');
        }
      }
    } catch (err: any) {
      setBarcodeError(`Código "${code}" no encontrado en catálogo.`);
    }
  };

  // Atajo de teclado F2 para cobrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' && items.length > 0) {
        e.preventDefault();
        setIsPaymentOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-6.5rem)]">
      {/* Panel Izquierdo: Catálogo y Búsqueda (7 columnas) */}
      <div className="lg:col-span-7 flex flex-col space-y-4 h-full overflow-hidden">
        {/* Barra superior de entrada: Código de barras y Búsqueda */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          {/* Lector de Barras */}
          <form onSubmit={handleBarcodeSubmit} className="relative">
            <Barcode className="w-5 h-5 text-emerald-600 absolute left-3 top-2.5" />
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Escanear código de barras (Enter)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-xs sm:text-sm font-mono focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </form>

          {/* Búsqueda por Texto */}
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Buscar producto por nombre..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>
        </div>

        {barcodeError && (
          <div className="flex items-center space-x-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{barcodeError}</span>
          </div>
        )}

        {/* Pestañas de Categorías */}
        <div className="flex space-x-2 overflow-x-auto pb-1 shrink-0">
          <button
            onClick={() => handleCategoriaSelect(null)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategoria === null
                ? 'bg-slate-900 text-white shadow'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoriaSelect(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategoria === cat.id
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>

        {/* Cuadrícula de Productos */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Cargando catálogo...</div>
          ) : productos.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No se encontraron productos.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {productos.map((prod) => {
                const sinStock = prod.stock_actual <= 0;
                return (
                  <button
                    key={prod.id}
                    disabled={sinStock}
                    onClick={() => addItem(prod, 1)}
                    className={`p-3.5 bg-white rounded-2xl border text-left flex flex-col justify-between transition-all hover:shadow-md group ${
                      sinStock
                        ? 'opacity-40 border-slate-200 cursor-not-allowed'
                        : 'border-slate-200 hover:border-emerald-400 active:scale-[0.98]'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        {prod.categoria_nombre || 'Producto'}
                      </span>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 mt-0.5 leading-snug group-hover:text-emerald-700">
                        {prod.nombre}
                      </h4>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-sm sm:text-base font-extrabold text-slate-900">
                          S/ {Number(prod.precio_venta).toFixed(2)}
                        </span>
                        <span
                          className={`block text-[10px] font-medium ${
                            sinStock
                              ? 'text-rose-500 font-bold'
                              : prod.stock_actual <= 5
                              ? 'text-amber-600 font-bold'
                              : 'text-slate-400'
                          }`}
                        >
                          Stock: {prod.stock_actual} unids
                        </span>
                      </div>

                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Panel Derecho: Carrito de Compras / Ticket (5 columnas) */}
      <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
        {/* Cabecera Carrito */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-800 text-sm sm:text-base">Ticket de Venta</h3>
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 font-bold">
              {getItemsCount()} items
            </span>
          </div>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-rose-500 hover:text-rose-700 font-medium flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          )}
        </div>

        {/* Lista de Ítems del Carrito */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <ShoppingBag className="w-12 h-12 text-slate-200 mb-2" />
              <p className="text-sm font-semibold">El carrito está vacío</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Escanee un código de barras o haga clic en los productos del catálogo para comenzar.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.producto.id}
                className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100"
              >
                <div className="flex-1 min-w-0 pr-3">
                  <h5 className="font-semibold text-xs text-slate-800 truncate">
                    {item.producto.nombre}
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    S/ {item.producto.precio_venta.toFixed(2)} c/u
                  </p>
                </div>

                {/* Controles de Cantidad */}
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    onClick={() => updateQuantity(item.producto.id, item.cantidad - 1)}
                    className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold text-slate-800">
                    {item.cantidad}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.producto.id, item.cantidad + 1)}
                    className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Subtotal Ítem */}
                <div className="w-16 text-right shrink-0">
                  <span className="font-bold text-xs text-slate-900">
                    S/ {item.subtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Resumen de Pago y Botón Cobrar */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal (Base imponible):</span>
              <span>S/ {getSubtotal().toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>IGV (18%):</span>
              <span>S/ {getIgv().toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1 border-t border-slate-200">
              <span>TOTAL A COBRAR:</span>
              <span className="text-emerald-700 text-lg">S/ {getTotal().toFixed(2)}</span>
            </div>
          </div>

          <button
            disabled={items.length === 0}
            onClick={() => setIsPaymentOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center space-x-2 transition-all active:scale-[0.99]"
          >
            <CreditCard className="w-5 h-5" />
            <span className="text-sm">Cobrar Venta (F2)</span>
          </button>
        </div>
      </div>

      {/* Modal de Pago */}
      <PaymentModal isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} />
    </div>
  );
};
