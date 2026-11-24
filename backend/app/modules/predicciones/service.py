"""
backend/app/modules/predicciones/service.py
Servicio para consulta de alertas de stock y ejecución del job de Machine Learning.
"""
import os
import json
from typing import List, Optional, Dict, Any
from app.core.database import db_manager
from app.core.config import settings
from app.ml.pipeline import run_ml_pipeline


class PrediccionService:
    def list_predicciones(self, nivel_alerta: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retorna las sugerencias de compra y semáforos predictivos de Supabase."""
        conn = db_manager.get_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    query = """
                        SELECT 
                            pr.id, pr.producto_id, p.nombre AS producto_nombre,
                            p.codigo_barras, p.stock_actual,
                            pr.demanda_diaria_estimada, pr.dias_cobertura,
                            pr.punto_reorden, pr.cantidad_sugerida,
                            pr.nivel_alerta, pr.resumen_ejecutivo,
                            pr.fecha_prediccion::TEXT
                        FROM public.predicciones pr
                        JOIN public.productos p ON pr.producto_id = p.id
                        WHERE (%s IS NULL OR pr.nivel_alerta = %s)
                        ORDER BY 
                            CASE pr.nivel_alerta 
                                WHEN 'critico' THEN 1 
                                WHEN 'advertencia' THEN 2 
                                ELSE 3 
                            END,
                            pr.dias_cobertura ASC;
                    """
                    cur.execute(query, (nivel_alerta, nivel_alerta))
                    return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        # Si aún no se ha ejecutado el pipeline, ejecutarlo automáticamente
        return []

    def get_summary(self) -> Dict[str, Any]:
        """Resumen ejecutivo con métricas de salud del catálogo y precisión del modelo."""
        items = self.list_predicciones()
        criticos = len([i for i in items if i["nivel_alerta"] == "critico"])
        advertencias = len([i for i in items if i["nivel_alerta"] == "advertencia"])
        optimos = len([i for i in items if i["nivel_alerta"] == "optimo"])

        # Cargar metadata del modelo
        metadata = {}
        if os.path.exists(settings.ML_METADATA_PATH):
            try:
                with open(settings.ML_METADATA_PATH, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
            except Exception:
                pass

        return {
            "total_productos": len(items),
            "criticos": criticos,
            "advertencias": advertencias,
            "optimos": optimos,
            "wape_score": metadata.get("wape"),
            "ultimo_entrenamiento": metadata.get("trained_at"),
            "alertas": items
        }

    def trigger_run(self) -> Dict[str, Any]:
        """Dispara el job de re-entrenamiento de LightGBM y generación de alertas."""
        return run_ml_pipeline()


prediccion_service = PrediccionService()
