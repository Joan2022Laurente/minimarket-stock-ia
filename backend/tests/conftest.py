"""
backend/tests/conftest.py
Fixtures de Pytest para cliente de pruebas y tokens de autenticación JWT.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token


@pytest.fixture(scope="session")
def client() -> TestClient:
    """Cliente HTTP síncrono para pruebas de API."""
    return TestClient(app)


@pytest.fixture
def admin_headers() -> dict:
    """Cabeceras con token de usuario Administrador."""
    token = create_access_token(data={
        "sub": "00000000-0000-0000-0000-000000000001",
        "email": "admin@elbuenvecino.com",
        "nombre": "Juan Pérez (Admin)",
        "rol": "administrador"
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def cajero_headers() -> dict:
    """Cabeceras con token de usuario Cajero."""
    token = create_access_token(data={
        "sub": "00000000-0000-0000-0000-000000000002",
        "email": "cajero1@elbuenvecino.com",
        "nombre": "Carlos Quispe (Cajero)",
        "rol": "cajero"
    })
    return {"Authorization": f"Bearer {token}"}
