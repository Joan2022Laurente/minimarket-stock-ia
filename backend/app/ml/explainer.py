"""
backend/app/ml/explainer.py
Generación de explicaciones y resúmenes ejecutivos en lenguaje natural.
"""
from typing import Dict, Any


def generate_executive_summary(metrics: Dict[str, Any]) -> str:
    """
    Genera una recomendación ejecutiva para el administrador del minimarket.
    Robusto y sin dependencias de red externas; genera texto claro y directo.
    """
    nombre = metrics["producto_nombre"]
    stock = metrics["stock_actual"]
    dias = metrics["dias_cobertura"]
    reorden = metrics["punto_reorden"]
    sugerido = metrics["cantidad_sugerida"]
    lead = metrics.get("lead_time_dias", 3)
    alerta = metrics["nivel_alerta"]

    if alerta == "critico":
        return (
            f"🚨 URGENTE: {nombre} tiene stock crítico ({stock} unids) con cobertura de solo {dias} días, "
            f"menor al tiempo de entrega del proveedor ({lead} días). Se recomienda ordenar {sugerido} unidades hoy."
        )
    elif alerta == "advertencia":
        return (
            f"⚠️ ATENCIÓN: {nombre} está en punto de reorden ({stock} unids disponibles, umbral {reorden}). "
            f"Generar orden preventiva de compra por {sugerido} unidades antes de 48 horas."
        )
    else:
        return (
            f"✅ ÓPTIMO: {nombre} cuenta con stock saludable ({stock} unids). "
            f"Cobertura estimada de {dias} días sin necesidad de compra inmediata."
        )
