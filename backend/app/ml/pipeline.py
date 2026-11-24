"""
backend/app/ml/pipeline.py
Pipeline end-to-end de Machine Learning: Extracción -> Feature Engineering -> LightGBM -> Reorden -> Supabase.
"""
import time
import logging
from typing import Dict, Any, List
from app.core.database import db_manager
from app.core.s3 import s3_service
from app.core.metrics import ML_PREDICTIONS_GENERATED_TOTAL
from app.ml.feature_engineering import prepare_training_features
from app.ml.model import demand_predictor
from app.ml.inventory_rules import calculate_inventory_metrics
from app.ml.explainer import generate_executive_summary

logger = logging.getLogger(__name__)


def run_ml_pipeline() -> Dict[str, Any]:
    """
    Ejecuta el ciclo de vida completo del modelo predictivo:
    1. Extrae las ventas de los últimos 90 días desde Supabase.
    2. Transforma features y entrena LightGBM con evaluación temporal WAPE.
    3. Calcula días de cobertura y puntos de reorden para todo el catálogo.
    4. Guarda las predicciones y alertas en la tabla 'predicciones'.
    5. Respalda el modelo en Amazon S3.
    """
    start_time = time.perf_counter()
    logger.info("Iniciando pipeline predictivo de inventario con LightGBM...")

    # 1. Extraer datos históricos de ventas
    conn = db_manager.get_connection()
    sales_data = []
    productos = []

    if conn:
        try:
            with conn.cursor() as cur:
                # Extraer ventas y líneas de los últimos 90 días
                cur.execute("""
                    SELECT d.producto_id, d.cantidad, v.created_at
                    FROM public.detalle_ventas d
                    JOIN public.ventas v ON d.venta_id = v.id
                    WHERE v.anulada = false AND v.created_at >= NOW() - INTERVAL '90 days'
                    ORDER BY v.created_at ASC;
                """)
                sales_data = [dict(r) for r in cur.fetchall()]

                # Extraer catálogo completo con proveedores
                cur.execute("""
                    SELECT p.id, p.nombre, p.stock_actual, p.stock_minimo, p.stock_seguridad,
                           pr.lead_time_dias
                    FROM public.productos p
                    LEFT JOIN public.proveedores pr ON p.proveedor_id = pr.id
                    WHERE p.activo = true;
                """)
                productos = [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    if not sales_data or len(sales_data) < 20:
        logger.warning("Pocos datos históricos en Supabase. Usando generador sintético para el modelo.")
        # Generar dataset mínimo para entrenamiento offline/test
        mock_data = []
        base_time = time.time() - (90 * 86400)
        for i in range(90):
            t_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(base_time + (i * 86400)))
            for pid in [1, 6, 12, 14, 20]:
                mock_data.append({"producto_id": pid, "cantidad": 2 + (i % 3), "created_at": t_str})
        sales_data = mock_data
        productos = db_manager._in_memory_data["productos"]

    # 2. Ingeniería de Características y Entrenamiento LightGBM
    X, y = prepare_training_features(sales_data)
    model_metrics = demand_predictor.train(X, y)

    # 3. Inferencia de Demanda Diaria Promedio por Producto
    # Usamos la predicción del modelo para los datos recientes
    preds = demand_predictor.predict(X)
    X_eval = X.copy()
    X_eval["pred"] = preds
    promedios_demanda = X_eval.groupby("producto_id")["pred"].mean().to_dict()

    # 4. Cálculo de Métricas de Inventario y Alertas
    alertas_generadas = []
    criticos_count = 0
    advertencia_count = 0
    optimo_count = 0

    for prod in productos:
        pid = prod["id"]
        demanda_est = promedios_demanda.get(pid, 2.0)
        inv_metrics = calculate_inventory_metrics(prod, demanda_est)
        resumen = generate_executive_summary(inv_metrics)
        inv_metrics["resumen_ejecutivo"] = resumen

        nivel = inv_metrics["nivel_alerta"]
        ML_PREDICTIONS_GENERATED_TOTAL.labels(nivel_alerta=nivel).inc()

        if nivel == "critico":
            criticos_count += 1
        elif nivel == "advertencia":
            advertencia_count += 1
        else:
            optimo_count += 1

        alertas_generadas.append(inv_metrics)

    # 5. Persistir en tabla 'predicciones' en Supabase o en memoria
    save_conn = db_manager.get_connection()
    if save_conn and alertas_generadas:
        try:
            with save_conn.cursor() as cur:
                # Limpiar predicciones del día previo para mantener catálogo actualizado
                cur.execute("DELETE FROM public.predicciones WHERE fecha_prediccion = CURRENT_DATE;")
                for a in alertas_generadas:
                    cur.execute("""
                        INSERT INTO public.predicciones (
                            producto_id, fecha_prediccion, demanda_diaria_estimada, dias_cobertura,
                            punto_reorden, cantidad_sugerida, nivel_alerta, resumen_ejecutivo, created_at
                        ) VALUES (%s, CURRENT_DATE, %s, %s, %s, %s, %s, %s, NOW());
                    """, (
                        a["producto_id"],
                        a["demanda_diaria_estimada"],
                        a["dias_cobertura"],
                        a["punto_reorden"],
                        a["cantidad_sugerida"],
                        a["nivel_alerta"],
                        a["resumen_ejecutivo"]
                    ))
                save_conn.commit()
        except Exception as e:
            logger.error(f"Error al guardar predicciones en Supabase: {e}")
            if save_conn:
                save_conn.rollback()
        finally:
            save_conn.close()
    else:
        db_manager._in_memory_data["predicciones"] = alertas_generadas

    # 6. Respaldo opcional del modelo en S3
    s3_uploaded = s3_service.upload_model_artifact(demand_predictor.model_path)

    total_duration = time.perf_counter() - start_time
    logger.info(f"Pipeline finalizado en {total_duration:.2f}s | {len(productos)} productos analizados.")

    return {
        "status": "success",
        "duration_seconds": round(total_duration, 3),
        "model_metrics": model_metrics,
        "productos_analizados": len(productos),
        "alertas_resumen": {
            "criticos": criticos_count,
            "advertencia": advertencia_count,
            "optimo": optimo_count
        },
        "s3_backup_success": s3_uploaded,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    }
