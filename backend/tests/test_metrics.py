from fastapi.testclient import TestClient


def test_http_metrics_use_route_templates(client: TestClient, cajero_headers: dict[str, str]) -> None:
    value = "observability-fixture-barcode-7392"
    client.get(f"/api/v1/productos/barcode/{value}", headers=cajero_headers)
    client.get("/observability-fixture-unknown-7392")

    metrics = client.get("/metrics").text
    assert 'endpoint="/api/v1/productos/barcode/{code}"' in metrics
    assert 'endpoint="unmatched"' in metrics
    assert value not in metrics
    assert "observability-fixture-unknown-7392" not in metrics
