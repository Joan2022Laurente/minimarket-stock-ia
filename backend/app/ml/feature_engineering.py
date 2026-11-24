"""
backend/app/ml/feature_engineering.py
Extracción y transformación de series temporales con lags y estacionalidad.
"""
from typing import List, Dict, Any, Tuple
import pandas as pd
import numpy as np


def prepare_training_features(sales_data: List[Dict[str, Any]]) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Convierte datos brutos de ventas en un dataset tabular con variables temporales:
    - Lags: t-1, t-7, t-14
    - Medias móviles: 7 días, 28 días
    - Calendario: día de semana, día de mes, fin de semana, quincena
    """
    if not sales_data:
        raise ValueError("No hay datos de ventas disponibles para entrenar.")

    df = pd.DataFrame(sales_data)
    df["fecha"] = pd.to_datetime(df["created_at"]).dt.date
    df["cantidad"] = pd.to_numeric(df["cantidad"], errors="coerce").fillna(1)

    # 1. Agrupar por producto y fecha
    daily_sales = df.groupby(["producto_id", "fecha"])["cantidad"].sum().reset_index()

    # 2. Reindexar para rellenar días con 0 ventas por producto
    fechas = pd.date_range(start=daily_sales["fecha"].min(), end=daily_sales["fecha"].max())
    productos = daily_sales["producto_id"].unique()
    grid = pd.MultiIndex.from_product([productos, fechas.date], names=["producto_id", "fecha"]).to_frame().reset_index(drop=True)

    merged = pd.merge(grid, daily_sales, on=["producto_id", "fecha"], how="left")
    merged["cantidad"] = merged["cantidad"].fillna(0)

    # 3. Ordenar cronológicamente por producto
    merged = merged.sort_values(["producto_id", "fecha"]).reset_index(drop=True)

    # 4. Generación de Lags Temporales por producto
    grouped = merged.groupby("producto_id")["cantidad"]
    merged["lag_1"] = grouped.shift(1)
    merged["lag_7"] = grouped.shift(7)
    merged["lag_14"] = grouped.shift(14)

    # 5. Medias Móviles y Desviación Estándar
    merged["rolling_mean_7"] = grouped.transform(lambda x: x.shift(1).rolling(7, min_periods=1).mean())
    merged["rolling_std_7"] = grouped.transform(lambda x: x.shift(1).rolling(7, min_periods=1).std()).fillna(0)
    merged["rolling_mean_28"] = grouped.transform(lambda x: x.shift(1).rolling(28, min_periods=1).mean())

    # 6. Variables de Calendario y Estacionalidad
    fechas_dt = pd.to_datetime(merged["fecha"])
    merged["dia_semana"] = fechas_dt.dt.dayofweek.astype("category")
    merged["dia_mes"] = fechas_dt.dt.day
    merged["is_weekend"] = fechas_dt.dt.dayofweek.isin([4, 5, 6]).astype(int)
    merged["is_payday"] = fechas_dt.dt.day.isin([14, 15, 16, 29, 30, 31]).astype(int)

    # 7. Eliminar filas con NaN generadas por los lags iniciales
    clean_df = merged.dropna().reset_index(drop=True)

    feature_cols = [
        "producto_id", "lag_1", "lag_7", "lag_14",
        "rolling_mean_7", "rolling_std_7", "rolling_mean_28",
        "dia_semana", "dia_mes", "is_weekend", "is_payday"
    ]
    X = clean_df[feature_cols]
    y = clean_df["cantidad"]

    return X, y
