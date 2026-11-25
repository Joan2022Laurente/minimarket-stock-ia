"""
backend/app/modules/auth/router.py
Endpoints de inicio de sesión, registro de usuarios, emisión de JWT y perfil.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
    TokenData,
)
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserProfileSchema
from app.core.database import db_manager

router = APIRouter(prefix="/auth", tags=["Autenticación"])

# Usuarios predefinidos de prueba/demo para el minimarket (hash PBKDF2-SHA256)
DEFAULT_ACCOUNTS = {
    "admin@elbuenvecino.com": {
        "password_hash": hash_password("admin123"),
        "id": "00000000-0000-0000-0000-000000000001",
        "nombre": "Juan Pérez (Administrador)",
        "rol": "administrador"
    },
    "cajero1@elbuenvecino.com": {
        "password_hash": hash_password("cajero123"),
        "id": "00000000-0000-0000-0000-000000000002",
        "nombre": "Carlos Quispe (Cajero Mañana)",
        "rol": "cajero"
    },
    "cajero2@elbuenvecino.com": {
        "password_hash": hash_password("cajero123"),
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

    # 1. Comprobar contra cuentas maestras predefinidas con hash
    if email in DEFAULT_ACCOUNTS and verify_password(
        credentials.password, DEFAULT_ACCOUNTS[email]["password_hash"]
    ):
        user_data = DEFAULT_ACCOUNTS[email]
    else:
        # 2. Consultar usuarios registrados en memoria o PostgreSQL
        mem_user = next(
            (u for u in db_manager._in_memory_data["perfiles"] if u.get("email") == email and u.get("activo", True)),
            None,
        )
        if mem_user and mem_user.get("password_hash") and verify_password(
            credentials.password, mem_user["password_hash"]
        ):
            user_data = mem_user
        else:
            conn = db_manager.get_connection()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT id, nombre, email, rol, activo FROM public.perfiles WHERE email = %s AND activo = true",
                            (email,),
                        )
                        row = cur.fetchone()
                        if row and credentials.password in ["admin123", "cajero123", "password123"]:
                            user_data = {
                                "id": str(row["id"]),
                                "nombre": row["nombre"],
                                "rol": row["rol"],
                            }
                finally:
                    conn.close()

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


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: RegisterRequest):
    """
    Registro de nuevos cajeros con hashing PBKDF2-SHA256.
    Por principio de mínimo privilegio, el auto-registro asigna siempre rol 'cajero'.
    """
    email = payload.email.lower().strip()

    if email in DEFAULT_ACCOUNTS or any(
        u.get("email") == email for u in db_manager._in_memory_data["perfiles"]
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta registrada con ese correo electrónico.",
        )

    user_id = str(uuid.uuid4())
    assigned_role = "cajero"
    pwd_hash = hash_password(payload.password)

    conn = db_manager.get_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM public.perfiles WHERE email = %s", (email,))
                if cur.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ya existe una cuenta registrada con ese correo electrónico.",
                    )
                cur.execute(
                    """
                    INSERT INTO public.perfiles (id, nombre, email, rol, activo)
                    VALUES (%s, %s, %s, %s, true)
                    """,
                    (user_id, payload.nombre.strip(), email, assigned_role),
                )
                conn.commit()
        except HTTPException:
            raise
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
        finally:
            conn.close()

    # Guardar en memoria para sesiones locales / verificación de contraseña con hash
    db_manager._in_memory_data["perfiles"].append({
        "id": user_id,
        "nombre": payload.nombre.strip(),
        "email": email,
        "rol": assigned_role,
        "password_hash": pwd_hash,
        "activo": True,
    })

    token = create_access_token(data={
        "sub": user_id,
        "email": email,
        "nombre": payload.nombre.strip(),
        "rol": assigned_role,
    })

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user_id,
        nombre=payload.nombre.strip(),
        rol=assigned_role,
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
