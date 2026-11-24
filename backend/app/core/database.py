"""
backend/app/core/database.py
Capa de abstracción de datos para PostgreSQL (Supabase) con fallback en memoria para tests.
"""
import logging
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabaseManager:
    def __init__(self):
        self.db_url = settings.DATABASE_URL
        self._use_in_memory = False
        self._in_memory_data: Dict[str, List[Dict[str, Any]]] = {
            "productos": [],
            "categorias": [],
            "proveedores": [],
            "ventas": [],
            "detalle_ventas": [],
            "movimientos_inventario": [],
            "predicciones": [],
            "perfiles": []
        }
        self._init_in_memory_catalog()

    def _init_in_memory_catalog(self):
        """Poblar datos mock para tests locales aislados."""
        self._in_memory_data["categorias"] = [
            {"id": 1, "nombre": "Lácteos y Huevos", "descripcion": "Leches y derivados", "icono": "Milk", "activo": True},
            {"id": 2, "nombre": "Abarrotes y Despensa", "descripcion": "Arroz, fideos, aceites", "icono": "ShoppingBag", "activo": True},
            {"id": 3, "nombre": "Bebidas y Licores", "descripcion": "Gaseosas y aguas", "icono": "Coffee", "activo": True},
        ]
        self._in_memory_data["productos"] = [
            {
                "id": 1, "codigo_barras": "7750106001018", "nombre": "Leche Evaporada Gloria Azul 400g",
                "categoria_id": 1, "proveedor_id": 1, "precio_costo": 3.40, "precio_venta": 4.20,
                "stock_actual": 48, "stock_minimo": 12, "stock_seguridad": 24, "activo": True
            },
            {
                "id": 6, "codigo_barras": "7750243000010", "nombre": "Arroz Extra Costeño Bolsa 1kg",
                "categoria_id": 2, "proveedor_id": 2, "precio_costo": 3.80, "precio_venta": 4.90,
                "stock_actual": 60, "stock_minimo": 20, "stock_seguridad": 30, "activo": True
            },
            {
                "id": 12, "codigo_barras": "7750104000101", "nombre": "Inca Kola Botella 1.5 Litros PET",
                "categoria_id": 3, "proveedor_id": 3, "precio_costo": 5.00, "precio_venta": 6.80,
                "stock_actual": 42, "stock_minimo": 12, "stock_seguridad": 24, "activo": True
            }
        ]
        self._in_memory_data["perfiles"] = [
            {"id": "00000000-0000-0000-0000-000000000001", "nombre": "Juan Pérez (Admin)", "email": "admin@elbuenvecino.com", "rol": "administrador", "activo": True},
            {"id": "00000000-0000-0000-0000-000000000002", "nombre": "Carlos Quispe (Cajero)", "email": "cajero1@elbuenvecino.com", "rol": "cajero", "activo": True}
        ]

    def get_connection(self):
        """Retorna conexión PostgreSQL activa."""
        if not self.db_url or self._use_in_memory:
            return None
        try:
            conn = psycopg2.connect(self.db_url, cursor_factory=RealDictCursor, connect_timeout=3)
            return conn
        except Exception as e:
            logger.warning(f"No se pudo conectar a PostgreSQL ({e}). Activando fallback en memoria.")
            self._use_in_memory = True
            return None

    def execute_query(self, query: str, params: tuple = None) -> List[Dict[str, Any]]:
        """Ejecuta consulta SELECT y retorna lista de diccionarios."""
        conn = self.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    results = cur.fetchall()
                    return [dict(r) for r in results]
            except Exception as e:
                logger.error(f"Error en execute_query: {e}")
                raise
            finally:
                conn.close()
        return []

    def execute_statement(self, statement: str, params: tuple = None) -> int:
        """Ejecuta sentencia INSERT/UPDATE/DELETE y retorna filas afectadas."""
        conn = self.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(statement, params)
                    conn.commit()
                    return cur.rowcount
            except Exception as e:
                conn.rollback()
                logger.error(f"Error en execute_statement: {e}")
                raise
            finally:
                conn.close()
        return 0


db_manager = DatabaseManager()
