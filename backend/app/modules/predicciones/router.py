"""
backend/app/modules/predicciones/router.py
Endpoints REST para visualización de predicciones y re-entrenamiento del modelo.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_user, require_admin, TokenData
from app.modules.predicciones.schemas import (
    PrediccionItem,
    PrediccionesSummary,
    TriggerPipelineResponse
)
from app.modules.predicciones.service import prediccion_service

router = APIRouter(prefix="/predicciones", tags=["Predicciones IA"])


@router.get("", response_model=List[PrediccionItem])
def get_alertas_predictivas(
    nivel_alerta: Optional[str] = Query(None, pattern="^(critico|advertencia|optimo)$"),
    current_user: TokenData = Depends(get_current_user)
):
    """Lista de productos con proyección de agotamiento y sugerencia de compra."""
    return prediccion_service.list_predicciones(nivel_alerta=nivel_alerta)


@router.get("/summary", response_model=PrediccionesSummary)
def get_resumen_predictivo(current_user: TokenData = Depends(get_current_user)):
    """Resumen para el panel de control: contador de alertas y métricas del modelo (WAPE)."""
    return prediccion_service.get_summary()


@router.post("/run", response_model=TriggerPipelineResponse)
def ejecutar_pipeline_predictivo(current_user: TokenData = Depends(require_admin)):
    """
    Dispara manualmente el entrenamiento de LightGBM y cálculo de alertas de stock.
    (Normalmente ejecutado como cron nocturno fuera del horario de atención).
    """
    return prediccion_service.trigger_run()
