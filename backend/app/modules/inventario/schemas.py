"""
backend/app/modules/inventario/schemas.py
Esquemas Pydantic para estado de stock, ajustes manuales y kardex.
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class InventarioItem(BaseModel):
    id: int
    codigo_barras: str
    nombre: str
    categoria_id: int
    categoria_nombre: Optional[str] = None
    stock_actual: int
    stock_minimo: int
    stock_seguridad: int
    estado_stock: str  # "critico", "bajo", "optimo"


class AjusteStockCreate(BaseModel):
    producto_id: int = Field(..., gt=0)
    cantidad: int = Field(..., description="Unidades a sumar o restar (positivo o negativo)")
    tipo: str = Field(..., pattern="^(ajuste_positivo|ajuste_negativo|compra)$")
    motivo: str = Field(..., min_length=3, max_length=200)


class MovimientoKardexItem(BaseModel):
    id: int
    producto_id: int
    producto_nombre: Optional[str] = None
    tipo: str
    cantidad: int
    stock_previo: int
    stock_posterior: int
    motivo: Optional[str] = None
    created_at: datetime
