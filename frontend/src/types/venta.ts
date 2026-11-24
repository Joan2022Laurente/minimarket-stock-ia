export interface CartItem {
  producto: {
    id: number;
    codigo_barras: string;
    nombre: string;
    precio_venta: number;
    stock_actual: number;
  };
  cantidad: number;
  subtotal: number;
}

export interface VentaItemPayload {
  producto_id: number;
  cantidad: number;
}

export interface VentaCreatePayload {
  metodo_pago: 'efectivo' | 'tarjeta' | 'yape_plin';
  monto_pagado?: number;
  items: VentaItemPayload[];
}

export interface VentaResponse {
  success: boolean;
  venta_id: number;
  numero_ticket: string;
  subtotal: number;
  igv: number;
  total: number;
  monto_pagado: number;
  vuelto: number;
  items_procesados: number;
  created_at: string;
}

export interface VentaListItem {
  id: number;
  numero_ticket: string;
  cajero_nombre: string;
  total: number;
  metodo_pago: string;
  created_at: string;
  anulada: boolean;
}

export interface VentaTicketItemDetail {
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface VentaTicketDetail extends VentaListItem {
  subtotal: number;
  igv: number;
  monto_pagado?: number;
  vuelto?: number;
  items: VentaTicketItemDetail[];
}
