"""
backend/app/ml/model.py
Modelo de Machine Learning supervisado con LightGBM Regressor y métricas WAPE/MAE.
"""
import os
import time
import json
import logging
from typing import Dict, Any, Tuple
import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error
from app.core.config import settings
from app.core.metrics import ML_TRAINING_DURATION_SECONDS, ML_WAPE_SCORE

logger = logging.getLogger(__name__)


class DemandPredictor:
    def __init__(self):
        self.model = None
        self.metadata = {}
        self.model_path = settings.ML_MODEL_PATH
        self.metadata_path = settings.ML_METADATA_PATH
        self._ensure_artifacts_dir()

    def _ensure_artifacts_dir(self):
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)

    def train(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
        """
        Entrena el modelo LightGBM con división temporal de test (sin data leakage).
        Calcula métricas de error: WAPE y MAE.
        """
        start_time = time.perf_counter()

        # División temporal: 80% entrenamiento histórico, 20% prueba reciente
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        # Parámetros regularizados para demanda intermitente de retail (<80 MB RAM)
        self.model = LGBMRegressor(
            objective="tweedie",
            tweedie_variance_power=1.2,
            boosting_type="gbdt",
            n_estimators=120,
            learning_rate=0.04,
            max_depth=4,
            num_leaves=15,
            min_child_samples=15,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            verbosity=-1
        )

        self.model.fit(X_train, y_train)

        # Evaluación en test temporal (últimos días de todos los productos)
        y_pred = self.model.predict(X_test)
        y_pred = np.clip(y_pred, 0, None)  # La demanda no puede ser negativa

        mae = float(mean_absolute_error(y_test, y_pred))

        # Evaluar WAPE agregado por producto en la ventana de test (horizonte de reposición)
        eval_df = pd.DataFrame({
            "producto_id": X_test["producto_id"].values,
            "y_real": y_test.values,
            "y_pred": y_pred,
        })
        agg = eval_df.groupby("producto_id", observed=True)[["y_real", "y_pred"]].sum()
        sum_actual = float(agg["y_real"].sum())
        wape = float((np.sum(np.abs(agg["y_real"] - agg["y_pred"])) / sum_actual) * 100) if sum_actual > 0 else 0.0

        duration = time.perf_counter() - start_time

        # Actualizar métricas de Prometheus
        ML_TRAINING_DURATION_SECONDS.set(duration)
        ML_WAPE_SCORE.set(wape)

        # Serializar modelo a disco (.joblib)
        joblib.dump(self.model, self.model_path)

        self.metadata = {
            "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "training_samples": len(X_train),
            "test_samples": len(X_test),
            "mae": round(mae, 4),
            "wape": round(wape, 2),
            "duration_seconds": round(duration, 3),
            "status": "success"
        }

        with open(self.metadata_path, "w", encoding="utf-8") as f:
            json.dump(self.metadata, f, indent=2)

        logger.info(f"Entrenamiento completado en {duration:.2f}s | WAPE: {wape:.2f}% | MAE: {mae:.2f}")
        return self.metadata

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Genera proyecciones de demanda para nuevos datos."""
        if self.model is None:
            if os.path.exists(self.model_path):
                self.model = joblib.load(self.model_path)
            else:
                raise RuntimeError("El modelo LightGBM aún no ha sido entrenado.")

        preds = self.model.predict(X)
        return np.clip(preds, 0, None)


demand_predictor = DemandPredictor()
