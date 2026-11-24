"""
backend/app/modules/auth/schemas.py
Esquemas Pydantic para login, tokens y perfil de usuario.
"""
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: str
    password: str


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
