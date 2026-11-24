export interface Categoria {
  id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  activo: boolean;
}

export interface Producto {
  id: number;
  codigo_barras: string;
  nombre: string;
  categoria_id: number;
  categoria_nombre?: string;
  proveedor_id?: number;
  proveedor_nombre?: string;
  precio_costo: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  stock_seguridad: number;
  activo: boolean;
}
