"""
backend/app/modules/productos/router.py
Endpoints REST para el catálogo de productos y búsqueda para POS.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.security import get_current_user, require_admin, TokenData
from app.modules.productos.schemas import ProductoResponse, CategoriaResponse
from app.modules.productos.service import producto_service

router = APIRouter(prefix="/productos", tags=["Productos"])


@router.get("", response_model=List[ProductoResponse])
def get_productos(
    categoria_id: Optional[int] = Query(None, description="Filtrar por ID de categoría"),
    search: Optional[str] = Query(None, description="Buscar por nombre o código de barras"),
    current_user: TokenData = Depends(get_current_user)
):
    """Retorna listado de productos con soporte para búsqueda y filtrado."""
    return producto_service.list_productos(categoria_id=categoria_id, search=search)


@router.get("/categorias", response_model=List[CategoriaResponse])
def get_categorias(current_user: TokenData = Depends(get_current_user)):
    """Lista las categorías disponibles para el catálogo."""
    return producto_service.list_categorias()


@router.get("/barcode/{code}", response_model=ProductoResponse)
def get_producto_by_barcode(code: str, current_user: TokenData = Depends(get_current_user)):
    """Búsqueda instantánea por código de barras para el escáner de caja."""
    producto = producto_service.get_by_barcode(code.strip())
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto con código de barras '{code}' no encontrado."
        )
    return producto


@router.get("/{producto_id}", response_model=ProductoResponse)
def get_producto_by_id(producto_id: int, current_user: TokenData = Depends(get_current_user)):
    """Obtiene el detalle de un producto por su ID."""
    producto = producto_service.get_by_id(producto_id)
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto ID {producto_id} no encontrado."
        )
    return producto
