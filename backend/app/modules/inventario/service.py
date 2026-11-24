"""
backend/app/modules/inventario/service.py
Lógica de auditoría de inventario, semáforos de stock y ajustes de kardex.
"""
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from app.core.database import db_manager
from app.modules.inventario.schemas import AjusteStockCreate


class InventarioService:
    def list_stock_status(self) -> List[Dict[str, Any]]:
        """Lista productos con clasificación de semáforo de inventario."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    query = """
                        SELECT 
                            p.id, p.codigo_barras, p.nombre, p.categoria_id,
                            c.nombre AS categoria_nombre,
                            p.stock_actual, p.stock_minimo, p.stock_seguridad,
                            CASE 
                                WHEN p.stock_actual <= p.stock_minimo THEN 'critico'
                                WHEN p.stock_actual <= p.stock_seguridad THEN 'bajo'
                                ELSE 'optimo'
                            END AS estado_stock
                        FROM public.productos p
                        LEFT JOIN public.categorias c ON p.categoria_id = c.id
                        WHERE p.activo = true
                        ORDER BY p.stock_actual ASC;
                    """
                    cur.execute(query)
                    return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        # Fallback en memoria
        res = []
        for p in db_manager._in_memory_data["productos"]:
            stock = p.get("stock_actual", 0)
            s_min = p.get("stock_minimo", 5)
            s_seg = p.get("stock_seguridad", 10)
            estado = "critico" if stock <= s_min else ("bajo" if stock <= s_seg else "optimo")
            res.append({
                "id": p["id"],
                "codigo_barras": p["codigo_barras"],
                "nombre": p["nombre"],
                "categoria_id": p["categoria_id"],
                "categoria_nombre": "Abarrotes",
                "stock_actual": stock,
                "stock_minimo": s_min,
                "stock_seguridad": s_seg,
                "estado_stock": estado
            })
        return res

    def ajustar_stock(
        self,
        ajuste_in: AjusteStockCreate,
        usuario_id: str
    ) -> Dict[str, Any]:
        """Ajusta manualmente el stock y registra el movimiento en el Kardex."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    # 1. Obtener y bloquear fila
                    cur.execute("SELECT id, nombre, stock_actual FROM public.productos WHERE id = %s FOR UPDATE;", (ajuste_in.producto_id,))
                    prod = cur.fetchone()
                    if not prod:
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

                    stock_previo = prod["stock_actual"]
                    nuevo_stock = stock_previo + ajuste_in.cantidad

                    if nuevo_stock < 0:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"El ajuste dejaría el stock en negativo ({nuevo_stock}). Operación cancelada."
                        )

                    # 2. Actualizar stock
                    cur.execute("UPDATE public.productos SET stock_actual = %s, updated_at = now() WHERE id = %s;", (nuevo_stock, ajuste_in.producto_id))

                    # 3. Registrar Kardex
                    cur.execute("""
                        INSERT INTO public.movimientos_inventario (
                            producto_id, tipo, cantidad, stock_previo, stock_posterior, motivo, usuario_id, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, now())
                        RETURNING id;
                    """, (ajuste_in.producto_id, ajuste_in.tipo, ajuste_in.cantidad, stock_previo, nuevo_stock, ajuste_in.motivo, usuario_id))

                    conn.commit()
                    return {
                        "success": True,
                        "producto_id": ajuste_in.producto_id,
                        "stock_previo": stock_previo,
                        "nuevo_stock": nuevo_stock,
                        "motivo": ajuste_in.motivo
                    }
            except HTTPException:
                raise
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
            finally:
                conn.close()

        # Fallback en memoria
        prod = next((p for p in db_manager._in_memory_data["productos"] if p["id"] == ajuste_in.producto_id), None)
        if not prod:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
        stock_previo = prod["stock_actual"]
        prod["stock_actual"] += ajuste_in.cantidad
        return {
            "success": True,
            "producto_id": ajuste_in.producto_id,
            "stock_previo": stock_previo,
            "nuevo_stock": prod["stock_actual"],
            "motivo": ajuste_in.motivo
        }

    def list_kardex(self, producto_id: Optional[int] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Historial de movimientos de inventario."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    query = """
                        SELECT m.id, m.producto_id, p.nombre AS producto_nombre,
                               m.tipo, m.cantidad, m.stock_previo, m.stock_posterior,
                               m.motivo, m.created_at
                        FROM public.movimientos_inventario m
                        JOIN public.productos p ON m.producto_id = p.id
                        WHERE (%s IS NULL OR m.producto_id = %s)
                        ORDER BY m.created_at DESC
                        LIMIT %s;
                    """
                    cur.execute(query, (producto_id, producto_id, limit))
                    return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()
        return []


inventario_service = InventarioService()
