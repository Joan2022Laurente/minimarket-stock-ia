"""
backend/app/modules/ventas/schemas.py
Esquemas Pydantic para registro de venta atómica e historial de tickets.
"""
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, Field


class VentaItemCreate(BaseModel):
    producto_id: int = Field(..., gt=0)
    cantidad: int = Field(..., gt=0)


class VentaCreate(BaseModel):
    metodo_pago: str = Field(..., pattern="^(efectivo|tarjeta|yape_plin)$")
    monto_pagado: Optional[Decimal] = Field(None, ge=0)
    items: List[VentaItemCreate] = Field(..., min_length=1)


class VentaResponse(BaseModel):
    success: bool = True
    venta_id: int
    numero_ticket: str
    subtotal: Decimal
    igv: Decimal
    total: Decimal
    monto_pagado: Decimal
    vuelto: Decimal
    items_procesados: int
    created_at: datetime


class VentaDetalleItem(BaseModel):
    producto_id: int
    producto_nombre: str
    cantidad: int
    precio_unitario: Decimal
    subtotal: Decimal


class VentaTicketDetail(BaseModel):
    id: int
    numero_ticket: str
    usuario_id: Optional[str] = None
    cajero_nombre: str
    subtotal: Decimal
    igv: Decimal
    total: Decimal
    metodo_pago: str
    monto_pagado: Optional[Decimal] = None
    vuelto: Optional[Decimal] = None
    anulada: bool = False
    created_at: datetime
    items: List[VentaDetalleItem] = []


class VentaListItem(BaseModel):
    id: int
    numero_ticket: str
    cajero_nombre: str
    total: Decimal
    metodo_pago: str
    created_at: datetime
    anulada: bool = False
