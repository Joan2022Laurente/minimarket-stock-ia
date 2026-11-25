"""
backend/app/core/s3.py
Cliente de integración con Amazon S3 para respaldos de base de datos y modelos.
"""
import os
import json
import time
import logging
from pathlib import Path
from typing import Optional, Dict, Any
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from app.core.config import settings
from app.core.metrics import BACKUP_LAST_SUCCESS_TIMESTAMP

logger = logging.getLogger(__name__)
LOCAL_UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"


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

    def upload_bytes(
        self,
        data: bytes,
        s3_key: str,
        content_type: str = "application/octet-stream",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Sube contenido binario (imágenes de productos o comprobantes) a Amazon S3.
        En entornos locales sin credenciales AWS, persiste en almacenamiento fallback local
        para mantener trazabilidad y pruebas funcionales consistentes.
        """
        extra_args: Dict[str, Any] = {"ContentType": content_type}
        if metadata:
            extra_args["Metadata"] = {k: str(v) for k, v in metadata.items()}

        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=s3_key,
                Body=data,
                **extra_args
            )
            BACKUP_LAST_SUCCESS_TIMESTAMP.set(time.time())
            url = f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{s3_key}"
            return {"success": True, "storage": "s3", "s3_key": s3_key, "url": url}
        except (ClientError, NoCredentialsError) as e:
            logger.warning(f"S3 en modo simulación local para {s3_key}: {e}")
            target_path = LOCAL_UPLOADS_DIR / s3_key
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(data)
            BACKUP_LAST_SUCCESS_TIMESTAMP.set(time.time())
            return {
                "success": True,
                "storage": "local_fallback",
                "s3_key": s3_key,
                "url": f"/uploads/{s3_key}"
            }

    def upload_product_image(
        self,
        producto_id: int,
        filename: str,
        content: bytes,
        content_type: str
    ) -> Dict[str, Any]:
        """Almacena la imagen de un producto en productos/<id>/<timestamp>_<ext>."""
        ext = os.path.splitext(filename)[1].lower() or ".jpg"
        ts = int(time.time())
        s3_key = f"productos/{producto_id}/img_{ts}{ext}"
        return self.upload_bytes(
            data=content,
            s3_key=s3_key,
            content_type=content_type,
            metadata={"producto_id": producto_id, "tipo": "imagen_producto"}
        )

    def upload_sale_receipt(
        self,
        venta_id: int,
        numero_ticket: str,
        ticket_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Respalda el comprobante electrónico de venta en JSON dentro de comprobantes/."""
        safe_ticket = numero_ticket.replace("/", "-")
        s3_key = f"comprobantes/{safe_ticket}_id{venta_id}.json"
        body = json.dumps(ticket_payload, default=str, ensure_ascii=False, indent=2).encode("utf-8")
        return self.upload_bytes(
            data=body,
            s3_key=s3_key,
            content_type="application/json",
            metadata={"venta_id": venta_id, "numero_ticket": numero_ticket, "tipo": "comprobante"}
        )


s3_service = S3Service()
