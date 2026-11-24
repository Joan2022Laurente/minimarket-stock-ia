"""
backend/app/modules/productos/schemas.py
Esquemas Pydantic para catálogo de productos y categorías.
"""
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict


class CategoriaResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    activo: bool = True


class ProductoBase(BaseModel):
    codigo_barras: str = Field(..., max_length=50)
    nombre: str = Field(..., min_length=2, max_length=150)
    categoria_id: int
    proveedor_id: Optional[int] = None
    precio_costo: Decimal = Field(..., ge=0)
    precio_venta: Decimal = Field(..., ge=0)
    stock_actual: int = Field(default=0, ge=0)
    stock_minimo: int = Field(default=5, ge=0)
    stock_seguridad: int = Field(default=10, ge=0)
    activo: bool = True


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    categoria_id: Optional[int] = None
    proveedor_id: Optional[int] = None
    precio_costo: Optional[Decimal] = None
    precio_venta: Optional[Decimal] = None
    stock_minimo: Optional[int] = None
    stock_seguridad: Optional[int] = None
    activo: Optional[bool] = None


class ProductoResponse(ProductoBase):
    id: int
    categoria_nombre: Optional[str] = None
    proveedor_nombre: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
