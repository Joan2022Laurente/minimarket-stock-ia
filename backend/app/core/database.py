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
        """Poblar catálogo completo de 28 productos peruanos para desarrollo offline y tests aislados."""
        self._in_memory_data["categorias"] = [
            {"id": 1, "nombre": "Lácteos y Huevos", "descripcion": "Leches y derivados", "icono": "Milk", "activo": True},
            {"id": 2, "nombre": "Abarrotes y Despensa", "descripcion": "Arroz, fideos, aceites", "icono": "ShoppingBag", "activo": True},
            {"id": 3, "nombre": "Bebidas y Licores", "descripcion": "Gaseosas y aguas", "icono": "Coffee", "activo": True},
            {"id": 4, "nombre": "Snacks y Golosinas", "descripcion": "Galletas y chocolates", "icono": "Cookie", "activo": True},
            {"id": 5, "nombre": "Limpieza y Hogar", "descripcion": "Detergentes y lejías", "icono": "Sparkles", "activo": True},
            {"id": 6, "nombre": "Cuidado Personal", "descripcion": "Shampoo y dentífricos", "icono": "User", "activo": True},
        ]
        self._in_memory_data["proveedores"] = [
            {"id": 1, "ruc": "20100190797", "razon_social": "GLORIA S.A.", "lead_time_dias": 2},
            {"id": 2, "ruc": "20100055237", "razon_social": "ALICORP S.A.A.", "lead_time_dias": 3},
            {"id": 3, "ruc": "20100107059", "razon_social": "ARCA CONTINENTAL LINDLEY S.A.", "lead_time_dias": 2},
            {"id": 4, "ruc": "20100122368", "razon_social": "MONDELEZ PERU S.A.", "lead_time_dias": 4},
            {"id": 5, "ruc": "20100152941", "razon_social": "PROCTER & GAMBLE DEL PERU S.R.L.", "lead_time_dias": 5},
        ]
        self._in_memory_data["productos"] = [
            {"id": 1, "codigo_barras": "7750106001018", "nombre": "Leche Evaporada Gloria Azul 400g", "categoria_id": 1, "proveedor_id": 1, "precio_costo": 3.40, "precio_venta": 4.20, "stock_actual": 48, "stock_minimo": 12, "stock_seguridad": 24, "lead_time_dias": 2, "activo": True},
            {"id": 2, "codigo_barras": "7750106001025", "nombre": "Leche Gloria Deslactosada Roja 400g", "categoria_id": 1, "proveedor_id": 1, "precio_costo": 3.60, "precio_venta": 4.50, "stock_actual": 32, "stock_minimo": 10, "stock_seguridad": 16, "lead_time_dias": 2, "activo": True},
            {"id": 3, "codigo_barras": "7750106001032", "nombre": "Yogurt Gloria Fresa 1 Litro", "categoria_id": 1, "proveedor_id": 1, "precio_costo": 5.20, "precio_venta": 6.80, "stock_actual": 18, "stock_minimo": 6, "stock_seguridad": 12, "lead_time_dias": 2, "activo": True},
            {"id": 4, "codigo_barras": "7750106001049", "nombre": "Queso Bonlé Edam Gloria 250g", "categoria_id": 1, "proveedor_id": 1, "precio_costo": 8.50, "precio_venta": 11.50, "stock_actual": 14, "stock_minimo": 4, "stock_seguridad": 8, "lead_time_dias": 2, "activo": True},
            {"id": 5, "codigo_barras": "7750000000056", "nombre": "Huevos Pardos Caleta x 15 unidades", "categoria_id": 1, "proveedor_id": 1, "precio_costo": 7.20, "precio_venta": 9.50, "stock_actual": 20, "stock_minimo": 5, "stock_seguridad": 10, "lead_time_dias": 2, "activo": True},
            {"id": 6, "codigo_barras": "7750243000010", "nombre": "Arroz Extra Costeño Bolsa 1kg", "categoria_id": 2, "proveedor_id": 2, "precio_costo": 3.80, "precio_venta": 4.90, "stock_actual": 60, "stock_minimo": 20, "stock_seguridad": 30, "lead_time_dias": 3, "activo": True},
            {"id": 7, "codigo_barras": "7750243000027", "nombre": "Aceite Vegetal Primor Clásico 900ml", "categoria_id": 2, "proveedor_id": 2, "precio_costo": 7.50, "precio_venta": 9.80, "stock_actual": 35, "stock_minimo": 10, "stock_seguridad": 20, "lead_time_dias": 3, "activo": True},
            {"id": 8, "codigo_barras": "7750243000034", "nombre": "Fideos Spaghetti Don Vittorio 450g", "categoria_id": 2, "proveedor_id": 2, "precio_costo": 2.30, "precio_venta": 3.20, "stock_actual": 50, "stock_minimo": 15, "stock_seguridad": 25, "lead_time_dias": 3, "activo": True},
            {"id": 9, "codigo_barras": "7750243000041", "nombre": "Atún Trozos Primor en Aceite 170g", "categoria_id": 2, "proveedor_id": 2, "precio_costo": 4.60, "precio_venta": 6.20, "stock_actual": 40, "stock_minimo": 12, "stock_seguridad": 20, "lead_time_dias": 3, "activo": True},
            {"id": 10, "codigo_barras": "7750243000058", "nombre": "Azúcar Rubia Cartavio Bolsa 1kg", "categoria_id": 2, "proveedor_id": 2, "precio_costo": 3.20, "precio_venta": 4.20, "stock_actual": 45, "stock_minimo": 15, "stock_seguridad": 25, "lead_time_dias": 3, "activo": True},
            {"id": 11, "codigo_barras": "7750243000065", "nombre": "Sal de Mesa Marina Emsal 1kg", "categoria_id": 2, "proveedor_id": 2, "precio_costo": 1.20, "precio_venta": 1.80, "stock_actual": 30, "stock_minimo": 8, "stock_seguridad": 15, "lead_time_dias": 3, "activo": True},
            {"id": 12, "codigo_barras": "7750104000101", "nombre": "Inca Kola Botella 1.5 Litros PET", "categoria_id": 3, "proveedor_id": 3, "precio_costo": 5.00, "precio_venta": 6.80, "stock_actual": 42, "stock_minimo": 12, "stock_seguridad": 24, "lead_time_dias": 2, "activo": True},
            {"id": 13, "codigo_barras": "7750104000118", "nombre": "Coca Cola Botella 1.5 Litros PET", "categoria_id": 3, "proveedor_id": 3, "precio_costo": 5.00, "precio_venta": 6.80, "stock_actual": 38, "stock_minimo": 12, "stock_seguridad": 24, "lead_time_dias": 2, "activo": True},
            {"id": 14, "codigo_barras": "7750104000125", "nombre": "Inca Kola Personal 500ml", "categoria_id": 3, "proveedor_id": 3, "precio_costo": 2.20, "precio_venta": 3.00, "stock_actual": 65, "stock_minimo": 20, "stock_seguridad": 35, "lead_time_dias": 2, "activo": True},
            {"id": 15, "codigo_barras": "7750104000132", "nombre": "Agua Mineral San Mateo sin Gas 600ml", "categoria_id": 3, "proveedor_id": 3, "precio_costo": 1.40, "precio_venta": 2.20, "stock_actual": 55, "stock_minimo": 15, "stock_seguridad": 30, "lead_time_dias": 2, "activo": True},
            {"id": 16, "codigo_barras": "7750104000149", "nombre": "Cerveza Cusqueña Dorada Lata 355ml", "categoria_id": 3, "proveedor_id": 3, "precio_costo": 4.50, "precio_venta": 6.50, "stock_actual": 48, "stock_minimo": 12, "stock_seguridad": 24, "lead_time_dias": 2, "activo": True},
            {"id": 17, "codigo_barras": "7622210000102", "nombre": "Galletas Casino Chocolate Pack x 6", "categoria_id": 4, "proveedor_id": 4, "precio_costo": 3.80, "precio_venta": 5.20, "stock_actual": 30, "stock_minimo": 10, "stock_seguridad": 18, "lead_time_dias": 4, "activo": True},
            {"id": 18, "codigo_barras": "7622210000119", "nombre": "Galletas Soda Field Pack x 6", "categoria_id": 4, "proveedor_id": 4, "precio_costo": 3.20, "precio_venta": 4.50, "stock_actual": 40, "stock_minimo": 12, "stock_seguridad": 20, "lead_time_dias": 4, "activo": True},
            {"id": 19, "codigo_barras": "7622210000126", "nombre": "Galletas Oreo Clásica Tubo 118g", "categoria_id": 4, "proveedor_id": 4, "precio_costo": 2.40, "precio_venta": 3.50, "stock_actual": 35, "stock_minimo": 10, "stock_seguridad": 18, "lead_time_dias": 4, "activo": True},
            {"id": 20, "codigo_barras": "7622210000133", "nombre": "Papas Lays Clásicas Bolsa 45g", "categoria_id": 4, "proveedor_id": 4, "precio_costo": 1.80, "precio_venta": 2.80, "stock_actual": 45, "stock_minimo": 15, "stock_seguridad": 25, "lead_time_dias": 4, "activo": True},
            {"id": 21, "codigo_barras": "7622210000140", "nombre": "Chocolate Sublime Clásico Barra 30g", "categoria_id": 4, "proveedor_id": 4, "precio_costo": 1.60, "precio_venta": 2.50, "stock_actual": 60, "stock_minimo": 20, "stock_seguridad": 30, "lead_time_dias": 4, "activo": True},
            {"id": 22, "codigo_barras": "7750153000105", "nombre": "Detergente Opal Ultra Lavado 800g", "categoria_id": 5, "proveedor_id": 2, "precio_costo": 7.80, "precio_venta": 10.50, "stock_actual": 25, "stock_minimo": 8, "stock_seguridad": 15, "lead_time_dias": 3, "activo": True},
            {"id": 23, "codigo_barras": "7750153000112", "nombre": "Lejía Clorox Tradicional 1 Litro", "categoria_id": 5, "proveedor_id": 5, "precio_costo": 3.00, "precio_venta": 4.50, "stock_actual": 28, "stock_minimo": 8, "stock_seguridad": 14, "lead_time_dias": 5, "activo": True},
            {"id": 24, "codigo_barras": "7750153000129", "nombre": "Papel Higiénico Suave Rinde Más x 4", "categoria_id": 5, "proveedor_id": 5, "precio_costo": 4.50, "precio_venta": 6.50, "stock_actual": 36, "stock_minimo": 10, "stock_seguridad": 20, "lead_time_dias": 5, "activo": True},
            {"id": 25, "codigo_barras": "7750153000136", "nombre": "Lavavajillas Sapolio Pasta Limón 350g", "categoria_id": 5, "proveedor_id": 2, "precio_costo": 2.80, "precio_venta": 4.00, "stock_actual": 22, "stock_minimo": 6, "stock_seguridad": 12, "lead_time_dias": 3, "activo": True},
            {"id": 26, "codigo_barras": "7500435100012", "nombre": "Shampoo Head & Shoulders Limpieza 375ml", "categoria_id": 6, "proveedor_id": 5, "precio_costo": 14.50, "precio_venta": 19.90, "stock_actual": 15, "stock_minimo": 5, "stock_seguridad": 8, "lead_time_dias": 5, "activo": True},
            {"id": 27, "codigo_barras": "7500435100029", "nombre": "Crema Dental Colgate Total 12 75ml", "categoria_id": 6, "proveedor_id": 5, "precio_costo": 4.20, "precio_venta": 6.00, "stock_actual": 30, "stock_minimo": 10, "stock_seguridad": 15, "lead_time_dias": 5, "activo": True},
            {"id": 28, "codigo_barras": "7500435100036", "nombre": "Jabón de Tocador Camay Clásico 125g", "categoria_id": 6, "proveedor_id": 5, "precio_costo": 2.10, "precio_venta": 3.20, "stock_actual": 40, "stock_minimo": 12, "stock_seguridad": 20, "lead_time_dias": 5, "activo": True}
        ]
        self._in_memory_data["perfiles"] = [
            {"id": "00000000-0000-0000-0000-000000000001", "nombre": "Juan Pérez (Administrador)", "email": "admin@elbuenvecino.com", "rol": "administrador", "activo": True},
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
