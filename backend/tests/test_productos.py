"""
backend/tests/test_productos.py
Pruebas de consulta de catálogo y búsqueda por lector de código de barras (T-04, T-12).
"""
def test_listar_productos(client, cajero_headers):
    response = client.get("/api/v1/productos", headers=cajero_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "codigo_barras" in data[0]
    assert "precio_venta" in data[0]


def test_buscar_por_codigo_barras_existente(client, cajero_headers):
    # Código de Leche Gloria
    response = client.get("/api/v1/productos/barcode/7750106001018", headers=cajero_headers)
    assert response.status_code == 200
    prod = response.json()
    assert prod["codigo_barras"] == "7750106001018"
    assert "Leche" in prod["nombre"]


def test_buscar_por_codigo_barras_inexistente(client, cajero_headers):
    response = client.get("/api/v1/productos/barcode/0000000000000", headers=cajero_headers)
    assert response.status_code == 404
