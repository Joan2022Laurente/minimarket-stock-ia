"""
backend/tests/test_inventario.py
Pruebas de semáforo de inventario y ajustes de stock (T-06, T-12).
"""
def test_estado_inventario_semaforos(client, cajero_headers):
    response = client.get("/api/v1/inventario", headers=cajero_headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) > 0
    assert "estado_stock" in items[0]
    assert items[0]["estado_stock"] in ["critico", "bajo", "optimo"]


def test_cajero_no_puede_hacer_ajuste_stock(client, cajero_headers):
    # Rol cajero no tiene permiso para ajustar stock
    response = client.post("/api/v1/inventario/ajuste", json={
        "producto_id": 1,
        "cantidad": 10,
        "tipo": "ajuste_positivo",
        "motivo": "Intento no autorizado"
    }, headers=cajero_headers)
    assert response.status_code == 403


def test_admin_puede_hacer_ajuste_stock(client, admin_headers):
    prods = client.get("/api/v1/productos", headers=admin_headers).json()
    prod = prods[0]

    response = client.post("/api/v1/inventario/ajuste", json={
        "producto_id": prod["id"],
        "cantidad": 5,
        "tipo": "ajuste_positivo",
        "motivo": "Ingreso por inventario físico mensual"
    }, headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
