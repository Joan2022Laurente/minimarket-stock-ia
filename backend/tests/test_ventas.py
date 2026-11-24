"""
backend/tests/test_ventas.py
Pruebas de la ruta crítica de venta en caja y validación de stock atómico (T-05, T-07, T-12).
"""
def test_registrar_venta_caja_exitosa(client, cajero_headers):
    # Obtener un producto activo
    prods = client.get("/api/v1/productos", headers=cajero_headers).json()
    prod = prods[0]

    venta_payload = {
        "metodo_pago": "efectivo",
        "monto_pagado": 50.00,
        "items": [
            {"producto_id": prod["id"], "cantidad": 1}
        ]
    }
    response = client.post("/api/v1/ventas", json=venta_payload, headers=cajero_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert "numero_ticket" in data
    assert float(data["total"]) > 0
    assert float(data["vuelto"]) >= 0


def test_venta_falla_por_stock_insuficiente(client, cajero_headers):
    prods = client.get("/api/v1/productos", headers=cajero_headers).json()
    prod = prods[0]

    venta_excesiva = {
        "metodo_pago": "efectivo",
        "monto_pagado": 10000.00,
        "items": [
            {"producto_id": prod["id"], "cantidad": 999999}
        ]
    }
    response = client.post("/api/v1/ventas", json=venta_excesiva, headers=cajero_headers)
    assert response.status_code in [400, 500]


def test_historial_ventas(client, cajero_headers):
    response = client.get("/api/v1/ventas?limit=10", headers=cajero_headers)
    assert response.status_code == 200
    ventas = response.json()
    assert isinstance(ventas, list)
