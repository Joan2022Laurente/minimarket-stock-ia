"""
backend/tests/test_ml_pipeline.py
Pruebas del motor predictivo LightGBM, cálculo de punto de reorden y métricas WAPE (T-08, T-09, T-12).
"""
import pandas as pd
from app.ml.feature_engineering import prepare_training_features
from app.ml.model import demand_predictor
from app.ml.inventory_rules import calculate_inventory_metrics
from app.ml.explainer import generate_executive_summary
from app.ml.pipeline import run_ml_pipeline


def test_feature_engineering_genera_lags():
    # Dataset sintético de prueba
    mock_sales = []
    for day in range(35):
        fecha = f"2026-09-{(day % 28) + 1:02d} 12:00:00"
        for pid in [1, 2]:
            mock_sales.append({"producto_id": pid, "cantidad": 2 + (day % 3), "created_at": fecha})

    X, y = prepare_training_features(mock_sales)
    assert not X.empty
    assert "lag_1" in X.columns
    assert "lag_7" in X.columns
    assert "rolling_mean_7" in X.columns
    assert "dia_semana" in X.columns
    assert len(X) == len(y)


def test_entrenamiento_lightgbm_y_wape():
    mock_sales = []
    for day in range(40):
        fecha = f"2026-09-{(day % 28) + 1:02d} 12:00:00"
        for pid in [1, 2, 3]:
            mock_sales.append({"producto_id": pid, "cantidad": 3 + (day % 2), "created_at": fecha})

    X, y = prepare_training_features(mock_sales)
    metrics = demand_predictor.train(X, y)

    assert metrics["status"] == "success"
    assert "wape" in metrics
    assert "mae" in metrics
    assert metrics["duration_seconds"] < 5.0  # Criterio: < 5s en entrenamiento


def test_reglas_de_inventario_reorden():
    prod = {
        "id": 1,
        "nombre": "Leche Gloria",
        "stock_actual": 8,
        "stock_minimo": 10,
        "stock_seguridad": 15,
        "lead_time_dias": 2
    }
    demanda_diaria = 4.0
    res = calculate_inventory_metrics(prod, demanda_diaria)

    # Demanda 4.0 * 2 días + 15 seguridad = 23.0
    assert res["punto_reorden"] == 23.0
    assert res["nivel_alerta"] == "critico"  # Stock (8) <= stock_minimo (10)
    assert res["cantidad_sugerida"] > 0

    resumen = generate_executive_summary(res)
    assert "URGENTE" in resumen


def test_endpoint_summary_predicciones(client, admin_headers):
    # Ejecutar pipeline antes para verificar persistencia
    pipeline_res = run_ml_pipeline()
    assert pipeline_res["status"] == "success"

    response = client.get("/api/v1/predicciones/summary", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_productos" in data
    assert "criticos" in data
    assert "advertencias" in data
    assert "optimos" in data
