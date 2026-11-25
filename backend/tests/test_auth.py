"""
backend/tests/test_auth.py
Pruebas de autenticación, JWT y control de acceso basado en roles (T-03, T-12).
"""
def test_login_exitoso(client):
    response = client.post("/api/v1/auth/login", json={
        "email": "admin@elbuenvecino.com",
        "password": "admin123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["rol"] == "administrador"
    assert data["token_type"] == "bearer"


def test_login_credenciales_invalidas(client):
    response = client.post("/api/v1/auth/login", json={
        "email": "admin@elbuenvecino.com",
        "password": "password_incorrecto"
    })
    assert response.status_code == 401
    assert "incorrectos" in response.json()["detail"].lower()


def test_acceso_sin_token_rechazado(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_perfil_con_token_valido(client, admin_headers):
    response = client.get("/api/v1/auth/me", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "admin@elbuenvecino.com"
    assert data["rol"] == "administrador"


def test_registro_y_login_nuevo_cajero(client):
    reg_payload = {
        "nombre": "Ana Torres",
        "email": "ana.torres@elbuenvecino.com",
        "password": "claveSegura123",
        "rol": "administrador"  # Debe ser forzado a 'cajero' por seguridad
    }
    res = client.post("/api/v1/auth/register", json=reg_payload)
    assert res.status_code == 201
    data = res.json()
    assert data["rol"] == "cajero"
    assert "access_token" in data

    # Login con la contraseña recién registrada
    login_res = client.post("/api/v1/auth/login", json={
        "email": "ana.torres@elbuenvecino.com",
        "password": "claveSegura123"
    })
    assert login_res.status_code == 200
    assert login_res.json()["nombre"] == "Ana Torres"

    # Correo duplicado debe responder 409
    dup_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert dup_res.status_code == 409
