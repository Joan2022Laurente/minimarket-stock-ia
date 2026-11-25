"""
backend/app/modules/productos/service.py
Lógica de acceso a datos y CRUD completo para productos y categorías.
"""
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from app.core.database import db_manager
from app.modules.productos.schemas import ProductoCreate, ProductoUpdate, CategoriaCreate


class ProductoService:
    def _enrich_in_memory(self, prod: Dict[str, Any]) -> Dict[str, Any]:
        cat = next(
            (c for c in db_manager._in_memory_data["categorias"] if c["id"] == prod.get("categoria_id")),
            None,
        )
        prov = next(
            (pr for pr in db_manager._in_memory_data["proveedores"] if pr["id"] == prod.get("proveedor_id")),
            None,
        )
        return {
            **prod,
            "categoria_nombre": cat["nombre"] if cat else prod.get("categoria_nombre", "General"),
            "proveedor_nombre": prov["razon_social"] if prov else prod.get("proveedor_nombre"),
        }

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
        res = [self._enrich_in_memory(p) for p in db_manager._in_memory_data["productos"]]
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
                return self._enrich_in_memory(p)
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
                return self._enrich_in_memory(p)
        return None

    def create_producto(self, payload: ProductoCreate) -> Dict[str, Any]:
        """Crea un nuevo SKU en el catálogo validando precio de venta >= costo."""
        if payload.precio_venta < payload.precio_costo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El precio de venta no puede ser menor al precio de costo.",
            )

        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id FROM public.productos WHERE codigo_barras = %s",
                        (payload.codigo_barras.strip(),),
                    )
                    if cur.fetchone():
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail=f"Ya existe un producto con el código '{payload.codigo_barras}'.",
                        )
                    cur.execute(
                        """
                        INSERT INTO public.productos (
                            codigo_barras, nombre, categoria_id, proveedor_id,
                            precio_costo, precio_venta, stock_actual, stock_minimo,
                            stock_seguridad, activo
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id;
                        """,
                        (
                            payload.codigo_barras.strip(),
                            payload.nombre.strip(),
                            payload.categoria_id,
                            payload.proveedor_id,
                            float(payload.precio_costo),
                            float(payload.precio_venta),
                            payload.stock_actual,
                            payload.stock_minimo,
                            payload.stock_seguridad,
                            payload.activo,
                        ),
                    )
                    new_id = cur.fetchone()["id"]
                    conn.commit()
                    return self.get_by_id(new_id)
            except HTTPException:
                raise
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
            finally:
                conn.close()

        # Fallback en memoria
        if any(p["codigo_barras"] == payload.codigo_barras.strip() for p in db_manager._in_memory_data["productos"]):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un producto con el código '{payload.codigo_barras}'.",
            )
        next_id = max((p["id"] for p in db_manager._in_memory_data["productos"]), default=0) + 1
        new_prod = {
            "id": next_id,
            "codigo_barras": payload.codigo_barras.strip(),
            "nombre": payload.nombre.strip(),
            "categoria_id": payload.categoria_id,
            "proveedor_id": payload.proveedor_id or 1,
            "precio_costo": float(payload.precio_costo),
            "precio_venta": float(payload.precio_venta),
            "stock_actual": payload.stock_actual,
            "stock_minimo": payload.stock_minimo,
            "stock_seguridad": payload.stock_seguridad,
            "imagen_url": payload.imagen_url,
            "lead_time_dias": 2,
            "activo": payload.activo,
        }
        db_manager._in_memory_data["productos"].append(new_prod)
        return self._enrich_in_memory(new_prod)

    def update_producto(self, producto_id: int, payload: ProductoUpdate) -> Optional[Dict[str, Any]]:
        """Actualiza campos editables de un producto."""
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            return self.get_by_id(producto_id)

        conn = db_manager.get_connection()
        if conn:
            try:
                allowed = {
                    "codigo_barras", "nombre", "categoria_id", "proveedor_id",
                    "precio_costo", "precio_venta", "stock_minimo", "stock_seguridad", "activo"
                }
                fields = [(k, float(v) if k in ("precio_costo", "precio_venta") and v is not None else v)
                          for k, v in updates.items() if k in allowed]
                if fields:
                    set_clause = ", ".join(f"{k} = %s" for k, _ in fields) + ", updated_at = now()"
                    values = [v for _, v in fields] + [producto_id]
                    with conn.cursor() as cur:
                        cur.execute(
                            f"UPDATE public.productos SET {set_clause} WHERE id = %s RETURNING id;",
                            tuple(values),
                        )
                        row = cur.fetchone()
                        if not row:
                            return None
                        conn.commit()
                return self.get_by_id(producto_id)
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
            finally:
                conn.close()

        prod = next((p for p in db_manager._in_memory_data["productos"] if p["id"] == producto_id), None)
        if not prod:
            return None
        for k, v in updates.items():
            if k in ("precio_costo", "precio_venta") and v is not None:
                prod[k] = float(v)
            else:
                prod[k] = v
        return self._enrich_in_memory(prod)

    def delete_producto(self, producto_id: int) -> bool:
        """Desactiva lógicamente un producto (soft delete) para preservar integridad referencial en ventas."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE public.productos SET activo = false, updated_at = now() WHERE id = %s RETURNING id;",
                        (producto_id,),
                    )
                    row = cur.fetchone()
                    conn.commit()
                    return row is not None
            finally:
                conn.close()

        prod = next((p for p in db_manager._in_memory_data["productos"] if p["id"] == producto_id), None)
        if not prod:
            return False
        prod["activo"] = False
        return True

    def list_categorias(self) -> List[Dict[str, Any]]:
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM public.categorias WHERE activo = true ORDER BY id ASC")
                    return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()
        return [c for c in db_manager._in_memory_data["categorias"] if c.get("activo", True)]

    def create_categoria(self, payload: CategoriaCreate) -> Dict[str, Any]:
        """Crea una nueva categoría de productos."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO public.categorias (nombre, descripcion, icono, activo)
                        VALUES (%s, %s, %s, true)
                        RETURNING id, nombre, descripcion, icono, activo;
                        """,
                        (payload.nombre.strip(), payload.descripcion, payload.icono),
                    )
                    row = dict(cur.fetchone())
                    conn.commit()
                    return row
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
            finally:
                conn.close()

        next_id = max((c["id"] for c in db_manager._in_memory_data["categorias"]), default=0) + 1
        cat = {
            "id": next_id,
            "nombre": payload.nombre.strip(),
            "descripcion": payload.descripcion,
            "icono": payload.icono or "Package",
            "activo": True,
        }
        db_manager._in_memory_data["categorias"].append(cat)
        return cat


producto_service = ProductoService()
