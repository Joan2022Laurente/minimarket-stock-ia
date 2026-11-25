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


def test_crud_completo_productos_y_imagen_s3(client, admin_headers, cajero_headers):
    nuevo = {
        "codigo_barras": "7759999000001",
        "nombre": "Panetón D'Onofrio Caja 900g",
        "categoria_id": 4,
        "precio_costo": 18.00,
        "precio_venta": 24.50,
        "stock_actual": 15,
        "stock_minimo": 4,
        "stock_seguridad": 8,
        "activo": True
    }
    # Cajero no puede crear producto
    forbidden = client.post("/api/v1/productos", json=nuevo, headers=cajero_headers)
    assert forbidden.status_code == 403

    # Admin crea producto
    created = client.post("/api/v1/productos", json=nuevo, headers=admin_headers)
    assert created.status_code == 201
    prod_id = created.json()["id"]

    # Subida de imagen a S3 (o fallback local)
    img_res = client.post(
        f"/api/v1/productos/{prod_id}/imagen",
        files={"file": ("paneton.jpg", b"\xff\xd8\xff\xe0dummyjpg", "image/jpeg")},
        headers=admin_headers,
    )
    assert img_res.status_code == 200
    assert img_res.json()["success"] is True
    assert "productos/" in img_res.json()["s3_key"]

    # Admin actualiza producto
    updated = client.put(
        f"/api/v1/productos/{prod_id}",
        json={"precio_venta": 25.00},
        headers=admin_headers,
    )
    assert updated.status_code == 200
    assert float(updated.json()["precio_venta"]) == 25.00

    # Admin desactiva producto (soft delete)
    deleted = client.delete(f"/api/v1/productos/{prod_id}", headers=admin_headers)
    assert deleted.status_code == 200
    assert deleted.json()["success"] is True
