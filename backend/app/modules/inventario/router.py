"""
backend/app/modules/inventario/router.py
Endpoints REST para monitoreo de stock en tiempo real y kardex.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_user, require_admin, TokenData
from app.modules.inventario.schemas import (
    InventarioItem,
    AjusteStockCreate,
    MovimientoKardexItem
)
from app.modules.inventario.service import inventario_service

router = APIRouter(prefix="/inventario", tags=["Inventario"])


@router.get("", response_model=List[InventarioItem])
def get_estado_inventario(current_user: TokenData = Depends(get_current_user)):
    """Retorna el estado de stock de todos los productos clasificados con semáforo (crítico, bajo, óptimo)."""
    return inventario_service.list_stock_status()


@router.post("/ajuste")
def realizar_ajuste_stock(
    ajuste_in: AjusteStockCreate,
    current_user: TokenData = Depends(require_admin)
):
    """Permite al administrador realizar ajustes de inventario (ingresos, mermas, inventario físico)."""
    return inventario_service.ajustar_stock(ajuste_in, usuario_id=current_user.user_id)


@router.get("/kardex", response_model=List[MovimientoKardexItem])
def get_historial_kardex(
    producto_id: Optional[int] = Query(None, description="Filtrar por ID de producto"),
    limit: int = Query(100, ge=1, le=500),
    current_user: TokenData = Depends(require_admin)
):
    """Auditoría de todos los movimientos de stock del minimarket."""
    return inventario_service.list_kardex(producto_id=producto_id, limit=limit)
