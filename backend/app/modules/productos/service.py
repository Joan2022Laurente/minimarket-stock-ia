"""
backend/app/modules/productos/service.py
Lógica de acceso a datos para productos y categorías.
"""
from typing import List, Optional, Dict, Any
from app.core.database import db_manager
from app.modules.productos.schemas import ProductoCreate, ProductoUpdate


class ProductoService:
    def list_productos(
        self,
        categoria_id: Optional[int] = None,
        search: Optional[str] = None,
        solo_activos: bool = True
    ) -> List[Dict[str, Any]]:
        """Lista productos con filtros por categoría o búsqueda de texto/código."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    query = """
                        SELECT 
                            p.id, p.codigo_barras, p.nombre, p.categoria_id, p.proveedor_id,
                            p.precio_costo, p.precio_venta, p.stock_actual, p.stock_minimo,
                            p.stock_seguridad, p.activo,
                            c.nombre AS categoria_nombre,
                            pr.razon_social AS proveedor_nombre
                        FROM public.productos p
                        LEFT JOIN public.categorias c ON p.categoria_id = c.id
                        LEFT JOIN public.proveedores pr ON p.proveedor_id = pr.id
                        WHERE (%s IS NULL OR p.categoria_id = %s)
                          AND (%s IS NULL OR (p.nombre ILIKE %s OR p.codigo_barras ILIKE %s))
                          AND (%s = false OR p.activo = true)
                        ORDER BY p.nombre ASC
                    """
                    search_term = f"%{search}%" if search else None
                    cur.execute(query, (categoria_id, categoria_id, search_term, search_term, search_term, solo_activos))
                    return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        # Fallback en memoria
        res = db_manager._in_memory_data["productos"]
        if categoria_id:
            res = [p for p in res if p.get("categoria_id") == categoria_id]
        if search:
            s = search.lower()
            res = [p for p in res if s in p.get("nombre", "").lower() or s in p.get("codigo_barras", "")]
        if solo_activos:
            res = [p for p in res if p.get("activo", True)]
        return res

    def get_by_id(self, producto_id: int) -> Optional[Dict[str, Any]]:
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    query = """
                        SELECT p.*, c.nombre AS categoria_nombre, pr.razon_social AS proveedor_nombre
                        FROM public.productos p
                        LEFT JOIN public.categorias c ON p.categoria_id = c.id
                        LEFT JOIN public.proveedores pr ON p.proveedor_id = pr.id
                        WHERE p.id = %s
                    """
                    cur.execute(query, (producto_id,))
                    row = cur.fetchone()
                    return dict(row) if row else None
            finally:
                conn.close()
        for p in db_manager._in_memory_data["productos"]:
            if p.get("id") == producto_id:
                return p
        return None

    def get_by_barcode(self, barcode: str) -> Optional[Dict[str, Any]]:
        """Búsqueda rápida por lector de código de barras para el POS."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    query = """
                        SELECT p.*, c.nombre AS categoria_nombre
                        FROM public.productos p
                        LEFT JOIN public.categorias c ON p.categoria_id = c.id
                        WHERE p.codigo_barras = %s AND p.activo = true
                    """
                    cur.execute(query, (barcode,))
                    row = cur.fetchone()
                    return dict(row) if row else None
            finally:
                conn.close()
        for p in db_manager._in_memory_data["productos"]:
            if p.get("codigo_barras") == barcode and p.get("activo", True):
                return p
        return None

    def list_categorias(self) -> List[Dict[str, Any]]:
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM public.categorias WHERE activo = true ORDER BY id ASC")
                    return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()
        return db_manager._in_memory_data["categorias"]


producto_service = ProductoService()
