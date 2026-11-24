"""
backend/app/core/config.py
Configuración centralizada de la aplicación basada en Pydantic v2 Settings.
"""
from pathlib import Path
from typing import List, Optional
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Entorno y metadatos
    ENVIRONMENT: str = "development"
    PROJECT_NAME: str = "Minimarket El Buen Vecino"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "elbuenvecino_staff_engineer_production_secret_key_32chars_min"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 horas

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://buenvecino.duckdns.org",
    ]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Supabase & PostgreSQL
    SUPABASE_URL: str = "https://smaogsmcjylbikmcjhzl.supabase.co"
    SUPABASE_ANON_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key"
    SUPABASE_SERVICE_ROLE_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_service_role"
    DATABASE_URL: Optional[str] = "postgresql://postgres:postgres@db.smaogsmcjylbikmcjhzl.supabase.co:5432/postgres"

    # AWS S3 (Backups y artefactos ML)
    AWS_REGION: str = "us-east-1"
    AWS_S3_BACKUP_BUCKET: str = "buenvecino-backups-bucket"
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None

    # Machine Learning
    ML_MODEL_PATH: str = str(Path(__file__).resolve().parent.parent / "ml" / "artifacts" / "model_latest.joblib")
    ML_METADATA_PATH: str = str(Path(__file__).resolve().parent.parent / "ml" / "artifacts" / "model_metadata.json")
    ML_LOOKBACK_DAYS: int = 90
    ML_FORECAST_HORIZON_DAYS: int = 7

    # LLM (Opcional)
    LLM_PROVIDER: str = "none"  # "openrouter" | "bedrock" | "none"
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_MODEL: str = "deepseek/deepseek-chat"

    # Observabilidad
    PROMETHEUS_METRICS_PORT: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
