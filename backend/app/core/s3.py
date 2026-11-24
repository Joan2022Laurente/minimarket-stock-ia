"""
backend/app/core/s3.py
Cliente de integración con Amazon S3 para respaldos de base de datos y modelos.
"""
import os
import time
import logging
from typing import Optional
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from app.core.config import settings
from app.core.metrics import BACKUP_LAST_SUCCESS_TIMESTAMP

logger = logging.getLogger(__name__)


class S3Service:
    def __init__(self):
        self.bucket = settings.AWS_S3_BACKUP_BUCKET
        self.region = settings.AWS_REGION
        self._client = None

    @property
    def client(self):
        """Inicializa el cliente de S3 (soporta IAM Instance Profile y credenciales explícitas)."""
        if self._client is None:
            if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
                self._client = boto3.client(
                    "s3",
                    region_name=self.region,
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                )
            else:
                # Usa credenciales automáticas de IAM Instance Profile en EC2
                self._client = boto3.client("s3", region_name=self.region)
        return self._client

    def upload_file(self, local_path: str, s3_key: str, metadata: Optional[dict] = None) -> bool:
        """Sube un archivo local a Amazon S3 y actualiza la métrica de observabilidad."""
        if not os.path.exists(local_path):
            logger.error(f"Archivo local no existe: {local_path}")
            return False

        extra_args = {}
        if metadata:
            extra_args["Metadata"] = {k: str(v) for k, v in metadata.items()}

        try:
            logger.info(f"Subiendo {local_path} a s3://{self.bucket}/{s3_key}")
            self.client.upload_file(local_path, self.bucket, s3_key, ExtraArgs=extra_args)
            BACKUP_LAST_SUCCESS_TIMESTAMP.set(time.time())
            logger.info(f"Subida exitosa: {s3_key}")
            return True
        except (ClientError, NoCredentialsError) as e:
            logger.warning(f"No se pudo subir a S3 (modo simulación / sin credenciales): {e}")
            return False

    def upload_model_artifact(self, model_path: str) -> bool:
        """Sube el artefacto serializado del modelo LightGBM (.joblib) a S3."""
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        s3_key = f"ml-models/model_{timestamp}.joblib"
        latest_key = "ml-models/model_latest.joblib"
        success = self.upload_file(model_path, s3_key)
        if success:
            self.upload_file(model_path, latest_key)
        return success


s3_service = S3Service()
