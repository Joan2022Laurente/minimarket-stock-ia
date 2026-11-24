"""
backend/app/core/security.py
Autenticación y autorización basada en JWT, roles y hashing de contraseñas.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/token",
    auto_error=False
)


class TokenData(BaseModel):
    user_id: str
    email: str
    nombre: str
    rol: str


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Genera un token JWT firmado con expiración."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> TokenData:
    """Decodifica y valida la firma y vigencia del JWT."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        nombre: str = payload.get("nombre", "Usuario")
        rol: str = payload.get("rol")
        if user_id is None or rol is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido: faltan atributos de identidad y rol.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return TokenData(user_id=user_id, email=email, nombre=nombre, rol=rol)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión ha expirado. Inicie sesión nuevamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales no válidas o firma de token corrupta.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> TokenData:
    """Dependencia para rutas protegidas. Requiere token Bearer válido."""
    if not token:
        # En desarrollo / pruebas sin token, si está habilitado fallback de prueba
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida. Proporcione un token Bearer.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(token)


def require_role(allowed_roles: list[str]):
    """Fábrica de dependencias para autorización basada en roles (RBAC)."""
    def role_checker(current_user: TokenData = Depends(get_current_user)) -> TokenData:
        if current_user.rol not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado: Se requiere rol {allowed_roles}. Rol actual: {current_user.rol}"
            )
        return current_user
    return role_checker


# Dependencias listas para usar en endpoints
require_admin = require_role(["administrador"])
require_cajero = require_role(["cajero", "administrador"])
