"""
backend/app/modules/ventas/router.py
Endpoints REST para ventas rápidas en caja (POS) e historial de tickets.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.security import get_current_user, require_cajero, TokenData
from app.modules.ventas.schemas import (
    VentaCreate,
    VentaResponse,
    VentaListItem,
    VentaTicketDetail
)
from app.modules.ventas.service import venta_service

router = APIRouter(prefix="/ventas", tags=["Ventas"])


@router.post("", response_model=VentaResponse, status_code=status.HTTP_201_CREATED)
def registrar_venta_endpoint(
    venta_in: VentaCreate,
    current_user: TokenData = Depends(require_cajero)
):
    """
    Ruta crítica del punto de venta (POS).
    Ejecuta el descuento de stock atómico con validación pesimista en Supabase (<1s p95).
    """
    resultado = venta_service.procesar_venta(
        venta_in=venta_in,
        usuario_id=current_user.user_id,
        cajero_nombre=current_user.nombre
    )
    return resultado


@router.get("", response_model=List[VentaListItem])
def get_historial_ventas(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: TokenData = Depends(get_current_user)
):
    """Historial de ventas de la tienda con paginación."""
    return venta_service.list_ventas(limit=limit, offset=offset)


@router.get("/{venta_id}", response_model=VentaTicketDetail)
def get_ticket_por_id(
    venta_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Obtiene el detalle completo de líneas de un ticket para reimpresión o consulta."""
    ticket = venta_service.get_ticket_detail(venta_id)
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket de venta ID {venta_id} no encontrado."
        )
    return ticket
