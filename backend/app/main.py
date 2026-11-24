"""
backend/app/main.py
Punto de entrada de la API FastAPI de Minimarket «El Buen Vecino».
Configura CORS, middlewares de observabilidad Prometheus y registra los módulos de negocio.
"""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.metrics import PrometheusMiddleware, get_metrics_response
from app.modules.auth.router import router as auth_router
from app.modules.productos.router import router as productos_router
from app.modules.ventas.router import router as ventas_router
from app.modules.inventario.router import router as inventario_router
from app.modules.predicciones.router import router as predicciones_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicialización del sistema
    print(f"🚀 Iniciando {settings.PROJECT_NAME} en entorno [{settings.ENVIRONMENT}]")
    yield
    print(f"🛑 Deteniendo {settings.PROJECT_NAME}")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Sistema web con IA para gestión predictiva de inventarios y punto de venta.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# 1. Middleware de Observabilidad Prometheus
app.add_middleware(PrometheusMiddleware)

# 2. Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Registro de Módulos (Vertical Slices)
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(productos_router, prefix=settings.API_V1_STR)
app.include_router(ventas_router, prefix=settings.API_V1_STR)
app.include_router(inventario_router, prefix=settings.API_V1_STR)
app.include_router(predicciones_router, prefix=settings.API_V1_STR)


# 4. Endpoints de Infraestructura y Observabilidad
@app.get("/metrics", tags=["Observabilidad"], include_in_schema=False)
def metrics_endpoint():
    """Endpoint raspado por Prometheus cada 15 segundos para monitorizar latencia y tráfico."""
    return get_metrics_response()


@app.get("/health", tags=["Salud"])
def health_check():
    """Health check de alta disponibilidad utilizado por Docker y Caddy."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/", tags=["Root"])
def root():
    return {
        "message": f"Bienvenido a la API de {settings.PROJECT_NAME}",
        "docs": "/docs",
        "health": "/health",
        "version": "1.0.0"
    }
