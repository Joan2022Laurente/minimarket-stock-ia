"""
backend/app/modules/ventas/service.py
Servicio de ventas: invoca la función PL/pgSQL registrar_venta() de forma atómica.
"""
import json
import time
from typing import List, Optional, Dict, Any
from decimal import Decimal
from fastapi import HTTPException, status
from app.core.database import db_manager
from app.core.metrics import SALES_REGISTERED_TOTAL, SALES_REVENUE_SOLES_TOTAL
from app.modules.ventas.schemas import VentaCreate


class VentaService:
    def _generate_ticket_number(self) -> str:
        """Genera un correlativo único de ticket con timestamp y milisegundos."""
        ms = int(time.time() * 1000) % 100000000
        return f"B001-{ms:08d}"

    def procesar_venta(
        self,
        venta_in: VentaCreate,
        usuario_id: str,
        cajero_nombre: str
    ) -> Dict[str, Any]:
        """Ejecuta la transacción atómica en Supabase vía registrar_venta()."""
        ticket_number = self._generate_ticket_number()
        items_payload = json.dumps([item.model_dump() for item in venta_in.items])

        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    query = """
                        SELECT public.registrar_venta(
                            %s, %s, %s, %s, %s, %s::jsonb
                        ) AS resultado;
                    """
                    cur.execute(query, (
                        ticket_number,
                        usuario_id,
                        cajero_nombre,
                        venta_in.metodo_pago,
                        float(venta_in.monto_pagado) if venta_in.monto_pagado else None,
                        items_payload
                    ))
                    conn.commit()
                    row = cur.fetchone()
                    result = row["resultado"] if row else None

                    if not result:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="La función registrar_venta no retornó respuesta."
                        )

                    # Incrementar métricas de negocio para Prometheus
                    total_venta = float(result.get("total", 0))
                    SALES_REGISTERED_TOTAL.labels(metodo_pago=venta_in.metodo_pago).inc()
                    SALES_REVENUE_SOLES_TOTAL.inc(total_venta)

                    return result
            except HTTPException:
                raise
            except Exception as e:
                conn.rollback()
                err_msg = str(e)
                if "ERR_STOCK_INSUFICIENTE" in err_msg:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)
                if "ERR_MONTO_INSUFICIENTE" in err_msg:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en transacción: {err_msg}")
            finally:
                conn.close()

        # Fallback en memoria para tests offline
        total = Decimal("0")
        for it in venta_in.items:
            prod = next((p for p in db_manager._in_memory_data["productos"] if p["id"] == it.producto_id), None)
            if not prod:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Producto {it.producto_id} no encontrado")
            if prod["stock_actual"] < it.cantidad:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Stock insuficiente para {prod['nombre']}")
            prod["stock_actual"] -= it.cantidad
            total += Decimal(str(prod["precio_venta"])) * it.cantidad

        subtotal = round(total / Decimal("1.18"), 2)
        igv = total - subtotal
        vuelto = (venta_in.monto_pagado or total) - total

        res = {
            "success": True,
            "id": len(db_manager._in_memory_data["ventas"]) + 1,
            "venta_id": len(db_manager._in_memory_data["ventas"]) + 1,
            "numero_ticket": ticket_number,
            "cajero_nombre": cajero_nombre,
            "metodo_pago": venta_in.metodo_pago,
            "subtotal": subtotal,
            "igv": igv,
            "total": total,
            "monto_pagado": venta_in.monto_pagado or total,
            "vuelto": vuelto,
            "items_procesados": len(venta_in.items),
            "anulada": False,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        db_manager._in_memory_data["ventas"].append(res)
        SALES_REGISTERED_TOTAL.labels(metodo_pago=venta_in.metodo_pago).inc()
        SALES_REVENUE_SOLES_TOTAL.inc(float(total))
        return res

    def list_ventas(
        self,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Historial de ventas ordenado cronológicamente de forma descendente."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    query = """
                        SELECT id, numero_ticket, cajero_nombre, total, metodo_pago, created_at, anulada
                        FROM public.ventas
                        ORDER BY created_at DESC
                        LIMIT %s OFFSET %s;
                    """
                    cur.execute(query, (limit, offset))
                    return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()
        return db_manager._in_memory_data["ventas"]

    def get_ticket_detail(self, venta_id: int) -> Optional[Dict[str, Any]]:
        """Detalle completo del ticket para impresión o visualización."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM public.ventas WHERE id = %s", (venta_id,))
                    venta = cur.fetchone()
                    if not venta:
                        return None
                    v_dict = dict(venta)

                    cur.execute("""
                        SELECT d.producto_id, p.nombre AS producto_nombre, d.cantidad, d.precio_unitario, d.subtotal
                        FROM public.detalle_ventas d
                        JOIN public.productos p ON d.producto_id = p.id
                        WHERE d.venta_id = %s
                    """, (venta_id,))
                    v_dict["items"] = [dict(r) for r in cur.fetchall()]
                    return v_dict
            finally:
                conn.close()
        return next((v for v in db_manager._in_memory_data["ventas"] if v["venta_id"] == venta_id), None)


venta_service = VentaService()
