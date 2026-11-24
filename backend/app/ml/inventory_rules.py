"""
backend/app/ml/inventory_rules.py
Reglas deterministas de punto de reorden, cobertura de stock y niveles de alerta.
"""
from typing import Dict, Any


def calculate_inventory_metrics(
    producto: Dict[str, Any],
    demanda_diaria: float
) -> Dict[str, Any]:
    """
    Calcula punto de reorden y días de cobertura a partir de la demanda estimada:
    - Cobertura (días) = Stock Actual / Demanda Diaria
    - Punto de Reorden = (Demanda Diaria * Lead Time del Proveedor) + Stock de Seguridad
    """
    stock_actual = int(producto.get("stock_actual", 0))
    stock_minimo = int(producto.get("stock_minimo", 5))
    stock_seguridad = int(producto.get("stock_seguridad", 10))
    lead_time = int(producto.get("lead_time_dias", 3) or 3)

    demanda_ajustada = max(0.1, round(float(demanda_diaria), 2))
    dias_cobertura = round(stock_actual / demanda_ajustada, 1)
    punto_reorden = round((demanda_ajustada * lead_time) + stock_seguridad, 1)

    # Cantidad sugerida para reabastecer a 14 días
    if stock_actual <= punto_reorden:
        cantidad_sugerida = max(0, int(round((demanda_ajustada * 14) + stock_seguridad - stock_actual)))
    else:
        cantidad_sugerida = 0

    # Clasificación de semáforo de riesgo
    if stock_actual <= stock_minimo or dias_cobertura <= lead_time:
        nivel_alerta = "critico"
    elif stock_actual <= punto_reorden:
        nivel_alerta = "advertencia"
    else:
        nivel_alerta = "optimo"

    return {
        "producto_id": producto["id"],
        "producto_nombre": producto.get("nombre", f"Producto {producto['id']}"),
        "stock_actual": stock_actual,
        "demanda_diaria_estimada": demanda_ajustada,
        "dias_cobertura": dias_cobertura,
        "punto_reorden": punto_reorden,
        "cantidad_sugerida": cantidad_sugerida,
        "nivel_alerta": nivel_alerta,
        "lead_time_dias": lead_time
    }
