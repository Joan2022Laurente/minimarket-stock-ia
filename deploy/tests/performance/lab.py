"""Validación manual de INIT-009 contra el Compose dedicado."""

import argparse
import ast
import base64
import json
import os
import re
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import ProxyHandler, Request, build_opener
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
PROJECT = "buenvecino-init009"
GATEWAY = "http://localhost:8080"
K6 = "grafana/k6@sha256:a33a0cfdc4d2483d6b7a3a22e726a499ff2831a671a49239104cd34a9937523c"
SERVICES = {"backend", "frontend", "caddy", "grafana", "prometheus", "node-exporter", "cadvisor"}
HTTP = build_opener(ProxyHandler({}))


def now():
    return datetime.now(UTC).isoformat(timespec="milliseconds")


def ensure(ok, detail):
    if not ok:
        raise RuntimeError(detail)


def docker(*args, **options):
    result = subprocess.run(["docker", *args], capture_output=True, encoding="utf-8", errors="replace", timeout=options.pop("timeout", 25), **options)
    ensure(result.returncode == 0, "Docker falló en " + args[0])
    return result.stdout


def request(base, route, payload=None, headers=None, timeout=5):
    if payload is not None:
        payload = json.dumps(payload).encode()
        headers = {**(headers or {}), "Content-Type": "application/json"}
    try:
        with HTTP.open(Request(base + route, data=payload, headers=headers or {}), timeout=timeout) as response:
            return response.status, response.read()
    except HTTPError as error:
        error.close()
        return error.code, b""
    except (OSError, URLError):
        return 0, b""


def checked(route, expected=200, payload=None, headers=None, timeout=5):
    status, body = request(GATEWAY, route, payload, headers, timeout)
    ensure(status == expected, f"{route} esperado={expected}, observado={status}")
    return json.loads(body) if body.startswith((b"{", b"[")) else body


def credentials():
    """Reusa la cuenta de prueba ya incluida en el test de login del repositorio."""
    module = ast.parse((ROOT / "backend/tests/test_auth.py").read_text(encoding="utf-8"))
    fixture = next(node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == "test_login_exitoso")
    args = fixture.body[0].value.keywords
    return ast.literal_eval(next(item.value for item in args if item.arg == "json"))


def auth(token):
    return {"Authorization": "Bearer " + token}


class Lab:
    def __init__(self, env_file):
        self.env = env_file
        context = docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}").strip()
        endpoint = context if os.environ.get("DOCKER_CONTEXT") else os.environ.get("DOCKER_HOST", context)
        ensure(endpoint.startswith(("unix://", "npipe://")), "Se requiere un Docker Engine local")
        self.containers = {}
        ids = docker("ps", "-aq", "--filter", f"label=com.docker.compose.project={PROJECT}").splitlines()
        ensure(len(ids) == 7, "Se requieren los siete servicios exclusivos de INIT-009")
        inspections = json.loads(docker("inspect", *ids))
        publications = {}
        for item in inspections:
            service = item["Config"]["Labels"]["com.docker.compose.service"]
            self.containers[service] = item["Id"]
            publications[service] = item["HostConfig"]["PortBindings"] or {}
            if service == "backend":
                env = dict(line.split("=", 1) for line in item["Config"]["Env"])
                ensure(env["DATABASE_URL"] == "" and env["ENVIRONMENT"] == "development"
                       and env["AWS_EC2_METADATA_DISABLED"] == "true" and env["AWS_SHARED_CREDENTIALS_FILE"] == "/dev/null",
                       "Backend fuera del perfil de laboratorio")
                cmd = item["Config"]["Cmd"]
                uid = docker("exec", item["Id"], "id", "-u").strip()
                ensure(uid == "10001" and cmd[cmd.index("--workers") + 1] == "1",
                       "Usuario o número de workers inesperados")
                ensure(item["HostConfig"]["RestartPolicy"]["Name"] == "unless-stopped", "Política de reinicio inesperada")
        ensure(set(self.containers) == SERVICES, "Servicios fuera de INIT-009")
        expected = {"caddy": {"80/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8080"}]},
                    "grafana": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3000"}]}}
        ensure({key: val for key, val in publications.items() if val} == expected, "Bindings inesperados")
        self.inventory = {"services": sorted(SERVICES), "bindings": expected,
                          "running": sorted(item["Config"]["Labels"]["com.docker.compose.service"]
                                            for item in inspections if item["State"]["Running"])}
        env = dict(line.split("=", 1) for line in env_file.read_text(encoding="ascii").splitlines() if "=" in line)
        self.grafana_headers = {"Authorization": "Basic " + base64.b64encode(f'admin:{env["GRAFANA_ADMIN_PASSWORD"]}'.encode()).decode()}

    def grafana(self, path):
        status, body = request("http://127.0.0.1:3000", path, headers=self.grafana_headers)
        ensure(status == 200, f"API Grafana HTTP {status}")
        return json.loads(body)

    def query(self, expression, start=None, end=None):
        method = "query" if start is None else "query_range"
        params = {"query": expression, **({"start": start, "end": end, "step": 5} if start is not None else {})}
        result = self.grafana(f"/api/datasources/proxy/uid/buenvecino-prometheus/api/v1/{method}?" + urlencode(params))
        return result["data"]["result"]


def functional(lab):
    checked("/api/v1/productos", 401)
    for path in ("/ready", "/metrics", "/uploads/fixture"):
        checked(path, 404)
    admin = auth(checked("/api/v1/auth/login", payload=credentials())["access_token"])
    fixture_id = uuid4().hex[:12]
    user = {"email": f"lab09-{fixture_id}@test.invalid", "password": f"fixture-{fixture_id}", "nombre": "Caja fixture", "rol": "administrador"}
    registration = checked("/api/v1/auth/register", 201, user)
    ensure(registration["rol"] == "cajero", "Autoregistro elevó privilegios")
    cashier = auth(checked("/api/v1/auth/login", payload={key: user[key] for key in ("email", "password")})["access_token"])
    checked("/api/v1/auth/me", headers=cashier)
    checked("/api/v1/inventario/kardex", 403, headers=cashier)
    categories = checked("/api/v1/productos/categorias", headers=admin)
    product = checked("/api/v1/productos", 201, {
        "codigo_barras": "lab09-func-" + fixture_id, "nombre": "Producto funcional fixture", "categoria_id": categories[0]["id"],
        "precio_costo": 2, "precio_venta": 3, "stock_actual": 8,
    }, admin)
    pid = product["id"]
    checked("/api/v1/inventario/ajuste", 200, {"producto_id": pid, "cantidad": 2, "tipo": "compra", "motivo": "Fixture INIT-009"}, admin)
    sale = {"metodo_pago": "efectivo", "monto_pagado": 10, "items": [{"producto_id": pid, "cantidad": 2}]}
    result = checked("/api/v1/ventas", 201, sale, cashier)
    ensure(float(result["total"]) == 6 and float(result["vuelto"]) == 4, "Importe inesperado")
    checked("/api/v1/ventas", 422, {**sale, "items": [{"producto_id": pid, "cantidad": 0}]}, cashier)
    checked("/api/v1/ventas", 400, {**sale, "items": [{"producto_id": pid, "cantidad": 99}]}, cashier)
    history = checked("/api/v1/ventas", headers=cashier)
    ensure(any(row["id"] == result["venta_id"] for row in history), "Venta ausente del historial")
    ticket = checked(f'/api/v1/ventas/{result["venta_id"]}', headers=cashier)
    ensure(ticket["items"][0]["cantidad"] == 2, "Ticket incorrecto")
    product = checked(f"/api/v1/productos/{pid}", headers=admin)
    movements = checked(f"/api/v1/inventario/kardex?producto_id={pid}", headers=admin)
    ensure(product["stock_actual"] == 8 and {m["cantidad"] for m in movements} >= {2, -2}, "Kardex o stock incorrectos")
    checked("/api/v1/predicciones/run", 403, {}, cashier)
    trained = checked("/api/v1/predicciones/run", 200, {}, admin, timeout=45)
    forecasts = checked("/api/v1/predicciones", headers=admin)
    files = docker("exec", lab.containers["backend"], "python", "-c",
                   "import os,pathlib; print(pathlib.Path(os.environ['ML_MODEL_PATH']).is_file(), "
                   "pathlib.Path(os.environ['ML_METADATA_PATH']).is_file())").strip()
    ensure(forecasts and files == "True True", "Faltan proyecciones y/o artefactos LightGBM")
    backend = lab.containers["backend"]
    change_mode = "import os; os.chmod(os.environ['ML_MODEL_PATH'], int(__import__('sys').argv[1], 8))"
    original = docker("exec", backend, "python", "-c",
                      "import os,stat; print(oct(stat.S_IMODE(os.stat(os.environ['ML_MODEL_PATH']).st_mode)))").strip()
    docker("exec", backend, "python", "-c", change_mode, "400")
    try:
        checked("/api/v1/predicciones/run", 500, {}, admin, timeout=45)
        recovered_sale = checked("/api/v1/ventas", 201, sale, cashier)
        ensure(float(recovered_sale["total"]) == 6, "Cambió el cálculo de ventas tras el fallo ML")
        ensure(checked(f"/api/v1/productos/{pid}", headers=admin)["stock_actual"] == 6,
               "La venta posterior al fallo ML no actualizó el stock")
    finally:
        docker("exec", backend, "python", "-c", change_mode, original)
    return {"utc": now(), "stock_inicial": 8, "ajuste": 2, "ventas_unidades": 2, "stock_final": 8,
            "total": 6, "vuelto": 4, "forecast_count": len(forecasts), "training_fields": sorted(trained),
            "negative_cases": {"stock": 400, "payload": 422, "kardex_cajero": 403, "run_cajero": 403, "anonymous": 401},
            "artifacts": True, "mode": "memoria y datos sintéticos",
            "ml_fault": {"cause": "artifact read-only", "predict_http": 500, "sale_http": 201, "stock_after_sale": 6}}


def performance(lab, users):
    serial = uuid4().hex[:12]
    fixture = credentials()
    env = {**os.environ, "LAB09_VUS": str(users), "LAB09_CASE": serial, "LAB09_ADMIN": fixture["email"],
           "LAB09_PASSWORD": fixture["password"]}
    folder = ROOT / "deploy/tests/performance"
    start = time.time()
    command = ["docker", "run", "--rm", "--network", f"{PROJECT}_red-web",
               "-e", "LAB09_VUS", "-e", "LAB09_CASE", "-e", "LAB09_ADMIN", "-e", "LAB09_PASSWORD",
               "--mount", f"type=bind,source={folder},target=/scripts,readonly",
               K6, "run", "--quiet", "--no-usage-report", "/scripts/concurrent-users.js"]
    process = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=90)
    end = time.time()
    summaries = [line for line in process.stdout.splitlines() if line.startswith('{"users":')]
    ensure(len(summaries) == 1, f"k6 no produjo resumen (salida {process.returncode})")
    report = json.loads(summaries[0])
    units = re.search(r"LAB09_KARDEX_UNITS=(\d+)", process.stderr + process.stdout)
    counters = report["metrics"]
    report.update(utc=now(), kardex_units=int(units[1]) if units else None, exit=process.returncode)
    report["sales_match_kardex"] = report["kardex_units"] == counters.get("lab_sales_ok", {}).get("values", {}).get("count")
    labels = f'container_label_com_docker_compose_project="{PROJECT}",container_label_com_docker_compose_service!=""'
    group = "container_label_com_docker_compose_service"
    queries = {
        "linux_cpu_used_pct": '100*(1-avg(rate(node_cpu_seconds_total{mode="idle"}[1m])))',
        "linux_mem_available_bytes": "node_memory_MemAvailable_bytes",
        "linux_root_available_bytes": 'node_filesystem_avail_bytes{mountpoint="/"}',
        "container_cpu_cores": f"sum by ({group})(rate(container_cpu_usage_seconds_total{{{labels}}}[45s]))",
        "container_memory_bytes": f"sum by ({group})(container_memory_working_set_bytes{{{labels}}})",
        "container_network_rx_bytes_s": f"sum by ({group})(rate(container_network_receive_bytes_total{{{labels},interface!='lo'}}[45s]))",
        "container_network_tx_bytes_s": f"sum by ({group})(rate(container_network_transmit_bytes_total{{{labels},interface!='lo'}}[45s]))",
        "ml_training_seconds": "ml_training_duration_seconds",
    }
    report["samples"] = {name: lab.query(expression, start, end) for name, expression in queries.items()}
    return report


def poll(predicate, timeout=30):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if predicate():
            return round(time.monotonic() - start, 3)
        time.sleep(1)
    raise RuntimeError("Tiempo de espera agotado")


def resilience(lab):
    checks = {}
    backend = lab.containers["backend"]
    frontend = lab.containers["frontend"]
    expression = 'up{job="fastapi-backend"}'
    uid = "buenvecino-alt-04"

    def firing():
        groups = lab.grafana("/api/prometheus/grafana/api/v1/rules")["data"]["groups"]
        rules = [rule for group in groups for rule in group["rules"]
                 if rule.get("uid") == uid or rule.get("name", "").startswith("ALT-04")]
        return any(alert["state"].lower() in {"alerting", "firing"} and alert["labels"].get("job") == "fastapi-backend"
                   for rule in rules for alert in rule.get("alerts", []))

    ensure(not firing(), "ALT-04 del backend ya estaba disparada")
    start = time.monotonic()
    docker("stop", backend)
    try:
        checks["backend_fail"] = request(GATEWAY, "/health")[0]
        checks["backend_detected_s"] = poll(lambda: lab.query(expression)[0]["value"][1] == "0")
        checks["alt04_fired_s"] = round(time.monotonic() - start + poll(firing, 185), 3)
    finally:
        docker("start", backend)
    checks["backend_resume_s"] = poll(lambda: request(GATEWAY, "/health")[0] == 200)
    checks["alt04_resolved_s"] = poll(lambda: not firing(), 65)
    ensure(checks["backend_fail"] == 502, "El gateway no informó caída del backend")

    before = int(docker("inspect", "--format", "{{.RestartCount}}", backend))
    started = time.monotonic()
    # Uvicorn atiende SIGTERM. La señal sale del propio contenedor y no marca una detención manual en Docker.
    subprocess.run(["docker", "exec", backend, "python", "-c", "import os,signal; os.kill(1,signal.SIGTERM)"],
                   capture_output=True, timeout=12)
    poll(lambda: int(docker("inspect", "--format", "{{.RestartCount}}", backend)) > before and request(GATEWAY, "/health")[0] == 200)
    checks["unexpected_exit_recovery_s"] = round(time.monotonic() - started, 3)
    checks["restart_count"] = int(docker("inspect", "--format", "{{.RestartCount}}", backend))
    checks["unexpected_exit_signal"] = "SIGTERM desde namespace del backend"

    docker("stop", frontend)
    try:
        checks["frontend_fail"] = request(GATEWAY, "/inventario")[0]
        ensure(checks["frontend_fail"] == 502, "El gateway no informó caída de frontend")
    finally:
        docker("start", frontend)
    checks["frontend_resume_s"] = poll(lambda: request(GATEWAY, "/inventario")[0] == 200)
    return {"utc": now(), **checks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("functional", "performance", "resilience"))
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--vus", choices=(1, 3, 5, 10), type=int, default=1)
    args = parser.parse_args()
    lab = Lab(args.env_file)
    task = {"functional": functional, "performance": lambda active: performance(active, args.vus), "resilience": resilience}[args.mode]
    result = task(lab)
    args.evidence.write_text(json.dumps({"inventory": lab.inventory, **result}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{args.mode} evidencia {args.evidence.name}", flush=True)
    if args.mode == "performance" and (result["exit"] != 0 or not result["sales_match_kardex"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
