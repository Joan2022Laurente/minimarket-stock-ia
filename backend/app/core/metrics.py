"""
backend/app/core/metrics.py
Instrumentación de métricas de observabilidad para Prometheus (ALT-01 a ALT-06).
"""
import time
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# 1. Métricas de Tráfico HTTP
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total de peticiones HTTP procesadas",
    ["method", "endpoint", "status"]
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "Latencia de peticiones HTTP en segundos (Objetivo p95 < 1s)",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0, 2.0, 5.0]
)

# 2. Métricas de Negocio (Punto de Venta)
SALES_REGISTERED_TOTAL = Counter(
    "sales_registered_total",
    "Número total de ventas completadas con éxito",
    ["metodo_pago"]
)

SALES_REVENUE_SOLES_TOTAL = Counter(
    "sales_revenue_soles_total",
    "Monto total recaudado en ventas en Soles (PEN)"
)

# 3. Métricas del Motor Predictivo (LightGBM)
ML_TRAINING_DURATION_SECONDS = Gauge(
    "ml_training_duration_seconds",
    "Duración en segundos del último entrenamiento del modelo LightGBM"
)

ML_WAPE_SCORE = Gauge(
    "ml_wape_score",
    "Error Porcentual Absoluto Ponderado (WAPE) del modelo LightGBM en test"
)

ML_PREDICTIONS_GENERATED_TOTAL = Counter(
    "ml_predictions_generated_total",
    "Total de alertas y predicciones de inventario calculadas",
    ["nivel_alerta"]
)

# 4. Métricas de Respaldo e Infraestructura
BACKUP_LAST_SUCCESS_TIMESTAMP = Gauge(
    "backup_last_success_timestamp",
    "Timestamp Unix del último respaldo exitoso a Amazon S3 (Alerta ALT-06 si > 26h)"
)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware para medir latencia y volumen de peticiones HTTP automáticamente."""
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ["/metrics", "/health"]:
            return await call_next(request)

        start_time = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            raise
        finally:
            duration = time.perf_counter() - start_time
            endpoint = request.url.path
            # Normalizar endpoints con IDs numéricos para evitar explosión de cardinalidad
            parts = endpoint.split("/")
            normalized_parts = [p if not p.isdigit() else "{id}" for p in parts]
            normalized_endpoint = "/".join(normalized_parts) or "/"

            HTTP_REQUESTS_TOTAL.labels(
                method=request.method,
                endpoint=normalized_endpoint,
                status=str(status_code)
            ).inc()

            HTTP_REQUEST_DURATION_SECONDS.labels(
                method=request.method,
                endpoint=normalized_endpoint
            ).observe(duration)


def get_metrics_response() -> Response:
    """Retorna el contenido formateado para el endpoint /metrics de Prometheus."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
