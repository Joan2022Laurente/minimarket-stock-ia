import { create } from 'zustand';
import { CartItem } from '../types/venta';
import { Producto } from '../types/producto';

interface CartState {
  items: CartItem[];
  addItem: (producto: Producto, cantidad?: number) => void;
  updateQuantity: (productoId: number, cantidad: number) => void;
  removeItem: (productoId: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getSubtotal: () => number;
  getIgv: () => number;
  getItemsCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (producto: Producto, cantidad: number = 1) => {
    set((state) => {
      const existing = state.items.find((i) => i.producto.id === producto.id);
      if (existing) {
        const newQty = existing.cantidad + cantidad;
        return {
          items: state.items.map((i) =>
            i.producto.id === producto.id
              ? {
                  ...i,
                  cantidad: newQty,
                  subtotal: Number((newQty * producto.precio_venta).toFixed(2)),
                }
              : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            producto: {
              id: producto.id,
              codigo_barras: producto.codigo_barras,
              nombre: producto.nombre,
              precio_venta: Number(producto.precio_venta),
              stock_actual: producto.stock_actual,
            },
            cantidad,
            subtotal: Number((cantidad * producto.precio_venta).toFixed(2)),
          },
        ],
      };
    });
  },
  updateQuantity: (productoId: number, cantidad: number) => {
    if (cantidad <= 0) {
      get().removeItem(productoId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.producto.id === productoId
          ? {
              ...i,
              cantidad,
              subtotal: Number((cantidad * i.producto.precio_venta).toFixed(2)),
            }
          : i
      ),
    }));
  },
  removeItem: (productoId: number) => {
    set((state) => ({
      items: state.items.filter((i) => i.producto.id !== productoId),
    }));
  },
  clearCart: () => set({ items: [] }),
  getTotal: () => {
    const sum = get().items.reduce((acc, i) => acc + i.subtotal, 0);
    return Number(sum.toFixed(2));
  },
  getSubtotal: () => {
    const total = get().getTotal();
    return Number((total / 1.18).toFixed(2));
  },
  getIgv: () => {
    const total = get().getTotal();
    const subtotal = get().getSubtotal();
    return Number((total - subtotal).toFixed(2));
  },
  getItemsCount: () => {
    return get().items.reduce((acc, i) => acc + i.cantidad, 0);
  },
}));
