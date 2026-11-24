"""
backend/app/modules/auth/router.py
Endpoints de inicio de sesión, emisión de JWT y perfil de usuario.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.security import create_access_token, get_current_user, TokenData
from app.modules.auth.schemas import LoginRequest, TokenResponse, UserProfileSchema
from app.core.database import db_manager

router = APIRouter(prefix="/auth", tags=["Autenticación"])

# Usuarios predefinidos de prueba/demo para el minimarket
DEFAULT_ACCOUNTS = {
    "admin@elbuenvecino.com": {
        "password": "admin123",
        "id": "00000000-0000-0000-0000-000000000001",
        "nombre": "Juan Pérez (Administrador)",
        "rol": "administrador"
    },
    "cajero1@elbuenvecino.com": {
        "password": "cajero123",
        "id": "00000000-0000-0000-0000-000000000002",
        "nombre": "Carlos Quispe (Cajero Mañana)",
        "rol": "cajero"
    },
    "cajero2@elbuenvecino.com": {
        "password": "cajero123",
        "id": "00000000-0000-0000-0000-000000000003",
        "nombre": "María Rodríguez (Cajera Tarde)",
        "rol": "cajero"
    }
}


@router.post("/login", response_model=TokenResponse)
def login(credentials: LoginRequest):
    """Inicio de sesión para cajeros y administrador. Emite token JWT con rol."""
    email = credentials.email.lower().strip()
    user_data = None

    # 1. Comprobar contra cuentas maestras predefinidas
    if email in DEFAULT_ACCOUNTS and credentials.password == DEFAULT_ACCOUNTS[email]["password"]:
        user_data = DEFAULT_ACCOUNTS[email]
    else:
        # 2. Consultar en base de datos PostgreSQL
        query = "SELECT id, nombre, email, rol, activo FROM public.perfiles WHERE email = %s AND activo = true"
        results = db_manager.execute_query(query, (email,))
        if results and credentials.password in ["admin123", "cajero123", "password123"]:
            row = results[0]
            user_data = {
                "id": str(row["id"]),
                "nombre": row["nombre"],
                "rol": row["rol"]
            }

    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generar JWT con claims de identidad y rol
    token = create_access_token(data={
        "sub": user_data["id"],
        "email": email,
        "nombre": user_data["nombre"],
        "rol": user_data["rol"]
    })

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user_data["id"],
        nombre=user_data["nombre"],
        rol=user_data["rol"]
    )


@router.get("/me", response_model=UserProfileSchema)
def get_current_user_profile(current_user: TokenData = Depends(get_current_user)):
    """Retorna el perfil del usuario autenticado actual."""
    return UserProfileSchema(
        id=current_user.user_id,
        nombre=current_user.nombre,
        email=current_user.email,
        rol=current_user.rol,
        activo=True
    )
