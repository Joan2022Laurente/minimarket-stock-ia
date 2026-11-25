"""
backend/app/modules/productos/router.py
Endpoints REST para CRUD de catálogo de productos, categorías e imágenes en S3.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from app.core.security import get_current_user, require_admin, TokenData
from app.core.s3 import s3_service
from app.modules.productos.schemas import (
    ProductoCreate,
    ProductoUpdate,
    ProductoResponse,
    CategoriaCreate,
    CategoriaResponse,
)
from app.modules.productos.service import producto_service

router = APIRouter(prefix="/productos", tags=["Productos"])
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get("", response_model=List[ProductoResponse])
def get_productos(
    categoria_id: Optional[int] = Query(None, description="Filtrar por ID de categoría"),
    search: Optional[str] = Query(None, description="Buscar por nombre o código de barras"),
    current_user: TokenData = Depends(get_current_user)
):
    """Retorna listado de productos con soporte para búsqueda y filtrado."""
    return producto_service.list_productos(categoria_id=categoria_id, search=search)


@router.post("", response_model=ProductoResponse, status_code=status.HTTP_201_CREATED)
def create_producto(
    producto_in: ProductoCreate,
    current_user: TokenData = Depends(require_admin)
):
    """Crea un nuevo producto en el catálogo (solo administrador)."""
    return producto_service.create_producto(producto_in)


@router.get("/categorias", response_model=List[CategoriaResponse])
def get_categorias(current_user: TokenData = Depends(get_current_user)):
    """Lista las categorías disponibles para el catálogo."""
    return producto_service.list_categorias()


@router.post("/categorias", response_model=CategoriaResponse, status_code=status.HTTP_201_CREATED)
def create_categoria(
    categoria_in: CategoriaCreate,
    current_user: TokenData = Depends(require_admin)
):
    """Crea una nueva categoría en el catálogo (solo administrador)."""
    return producto_service.create_categoria(categoria_in)


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


@router.put("/{producto_id}", response_model=ProductoResponse)
def update_producto(
    producto_id: int,
    producto_in: ProductoUpdate,
    current_user: TokenData = Depends(require_admin)
):
    """Actualiza datos de un producto existente (solo administrador)."""
    updated = producto_service.update_producto(producto_id, producto_in)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto ID {producto_id} no encontrado."
        )
    return updated


@router.delete("/{producto_id}", status_code=status.HTTP_200_OK)
def delete_producto(
    producto_id: int,
    current_user: TokenData = Depends(require_admin)
):
    """Desactiva un producto del catálogo activo (soft delete, solo administrador)."""
    deleted = producto_service.delete_producto(producto_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto ID {producto_id} no encontrado."
        )
    return {"success": True, "producto_id": producto_id, "message": "Producto desactivado correctamente."}


@router.post("/{producto_id}/imagen")
async def upload_producto_imagen(
    producto_id: int,
    file: UploadFile = File(...),
    current_user: TokenData = Depends(require_admin)
):
    """Sube imagen del producto a Amazon S3 (con fallback local) y actualiza imagen_url."""
    producto = producto_service.get_by_id(producto_id)
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto ID {producto_id} no encontrado."
        )

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagen no válido. Use JPG, PNG o WEBP.",
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La imagen excede el tamaño máximo permitido de 5 MB.",
        )

    upload_res = s3_service.upload_product_image(
        producto_id=producto_id,
        filename=file.filename or "producto.jpg",
        content=content,
        content_type=file.content_type,
    )
    producto_service.update_producto(producto_id, ProductoUpdate(imagen_url=upload_res["url"]))
    return {**upload_res, "producto_id": producto_id}
