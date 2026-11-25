"""
backend/app/modules/auth/schemas.py
Esquemas Pydantic para login, registro, tokens y perfil de usuario.
"""
from typing import Literal
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=150)
    password: str = Field(..., min_length=6, max_length=100)
    rol: Literal["cajero", "administrador"] = "cajero"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    nombre: str
    rol: str


class UserProfileSchema(BaseModel):
    id: str
    nombre: str
    email: str
    rol: str
    activo: bool
