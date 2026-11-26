"""
backend/app/core/metrics.py
Instrumentación de métricas de observabilidad para Prometheus.
"""
import time
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from app.core.config import settings

STANDARD_HTTP_METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"})

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

# Permite que ALT-05 mida el primer lote si Prometheus ya hizo un scrape.
HTTP_REQUEST_DURATION_SECONDS.labels(method="POST", endpoint=f"{settings.API_V1_STR}/ventas")

# 2. Métricas de Negocio (Punto de Venta)
SALES_REGISTERED_TOTAL = Counter(
    "sales_registered_total",
    "Número total de ventas completadas con éxito",
    ["metodo_pago"]
)

# Registrar los métodos de pago válidos antes de la primera venta para que
# Prometheus pueda observar el primer incremento de cada serie.
for payment_method in ("efectivo", "tarjeta", "yape_plin"):
    SALES_REGISTERED_TOTAL.labels(metodo_pago=payment_method)

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
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in {"/metrics", "/health", "/ready"}:
            return await call_next(request)

        start_time = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration = time.perf_counter() - start_time
            route = request.scope.get("route")
            template = getattr(route, "path_format", None)
            api_prefix = f"{settings.API_V1_STR}/"
            # FastAPI can expose the template relative to the included router.
            if template and request.url.path.startswith(api_prefix) and not template.startswith(api_prefix):
                template = settings.API_V1_STR + template
            endpoint = template or "unmatched"
            method = request.method if request.method in STANDARD_HTTP_METHODS else "OTHER"

            HTTP_REQUESTS_TOTAL.labels(
                method=method,
                endpoint=endpoint,
                status=str(status_code)
            ).inc()

            HTTP_REQUEST_DURATION_SECONDS.labels(
                method=method,
                endpoint=endpoint
            ).observe(duration)


def get_metrics_response() -> Response:
    """Retorna el contenido formateado para el endpoint /metrics de Prometheus."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
