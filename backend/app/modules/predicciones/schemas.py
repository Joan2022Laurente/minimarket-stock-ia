"""
backend/app/modules/predicciones/schemas.py
Esquemas Pydantic para reportes de alertas predictivas de inventario.
"""
from typing import List, Optional, Dict, Any
from decimal import Decimal
from pydantic import BaseModel


class PrediccionItem(BaseModel):
    id: Optional[int] = None
    producto_id: int
    producto_nombre: str
    codigo_barras: Optional[str] = None
    stock_actual: int
    demanda_diaria_estimada: Decimal
    dias_cobertura: Decimal
    punto_reorden: Decimal
    cantidad_sugerida: int
    nivel_alerta: str  # "critico", "advertencia", "optimo"
    resumen_ejecutivo: Optional[str] = None
    fecha_prediccion: Optional[str] = None


class PrediccionesSummary(BaseModel):
    total_productos: int
    criticos: int
    advertencias: int
    optimos: int
    wape_score: Optional[float] = None
    mae_score: Optional[float] = None
    ultimo_entrenamiento: Optional[str] = None
    alertas: List[PrediccionItem] = []


class TriggerPipelineResponse(BaseModel):
    status: str
    duration_seconds: float
    model_metrics: Dict[str, Any]
    productos_analizados: int
    alertas_resumen: Dict[str, int]
    s3_backup_success: bool
    timestamp: str
