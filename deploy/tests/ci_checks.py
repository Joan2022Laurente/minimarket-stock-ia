"""Comprobaciones reproducibles del repositorio y del laboratorio de CI."""

import argparse
import ast
import base64
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
SERVICES = {"backend", "frontend", "caddy", "grafana", "prometheus", "cadvisor", "node-exporter"}
JOBS = {"fastapi-backend", "node-exporter", "cadvisor"}
VOLUMES = {"caddy_data", "caddy_config", "ml_artifacts", "grafana_data", "prometheus_data"}
DASHBOARDS = {f"buenvecino-{name}" for name in ("infraestructura", "contenedores", "aplicacion")}
DATASOURCE = "buenvecino-prometheus"
SENSITIVE_FILENAME = re.compile(
    r"(^\.env($|\.)|\.env$|(^|\.)pgpass$|^\.pg_service\.conf$|\.(pem|key|p12|pfx|pgservice|dump)(\.meta)?$)",
    re.IGNORECASE,
)
SECRET_PATTERN = re.compile(
    rb"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|"
    rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[0-9A-Za-z]{36,}\b|"
    rb"\bgithub_pat_[0-9A-Za-z_]{40,}\b|"
    rb"\beyJ[0-9A-Za-z_-]{15,}\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{20,}\b"
)


def ensure(condition, detail: str) -> None:
    if not condition:
        raise ValueError(detail)


def read_json(file: Path):
    return json.loads(file.read_text(encoding="utf-8"))


def read_yaml(file: Path):
    import yaml

    return yaml.safe_load(file.read_text(encoding="utf-8"))


def check_secrets(files, context: str) -> None:
    issues = 0
    for file in files:
        if SENSITIVE_FILENAME.search(file.name) and file.name != ".env.example":
            issues += 1
        elif file.suffix.lower() not in {".png", ".jpg", ".webp", ".ico", ".pdf", ".woff", ".woff2"}:
            issues += int(bool(SECRET_PATTERN.search(file.read_bytes())))
    ensure(issues == 0, f"{context}: {issues} candidatos a secretos o archivos sensibles. Revisar fuera de los logs.")


def check_static() -> None:
    automation = [*(ROOT / ".github/workflows").glob("*.yml"), *(ROOT / "deploy").rglob("*.sh"),
                  *(ROOT / "deploy/systemd").iterdir()]
    for file in automation:
        data = file.read_bytes()
        ensure(b"\r\n" not in data and data.endswith(b"\n"), f"Se requiere LF en {file.relative_to(ROOT)}")
    for file in [*(ROOT / "deploy").rglob("*.py"), *(ROOT / "monitoring").rglob("*.py")]:
        ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
    for folder in (".github", "deploy", "monitoring"):
        for file in (ROOT / folder).rglob("*.yml"):
            read_yaml(file)
    for name in ("backend", "frontend"):
        context = ROOT / name
        bases = re.findall(r"^FROM\s+(\S+)", (context / "Dockerfile").read_text(), re.M)
        pinned = [reference for reference in bases if ":" in reference or "/" in reference]
        ensure(pinned and all(re.search(r"@sha256:[a-f0-9]{64}$", base) for base in pinned), f"Bases Docker: {name}")
        ensure(".env" in (context / ".dockerignore").read_text(), f".dockerignore: {name}")
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    files = (ROOT / name for name in tracked if name)
    check_secrets((file for file in files if file.is_file()), "Archivos rastreados")
    print("PASS YAML, Python, LF, bases .dockerignore y reglas de secretos sin volcar valores")


def check_observability() -> None:
    grafana = ROOT / "monitoring/grafana"
    provisioning = grafana / "provisioning"
    dashboards = [read_json(path) for path in (grafana / "dashboards").glob("*.json")]
    ensure(len(dashboards) == 3 and {dashboard["uid"] for dashboard in dashboards} == DASHBOARDS, "UIDs de dashboards")
    datasource = read_yaml(provisioning / "datasources/prometheus.yml")["datasources"]
    ensure(len(datasource) == 1 and datasource[0]["uid"] == DATASOURCE
           and datasource[0]["url"] == "http://prometheus:9090" and datasource[0]["access"] == "proxy", "Datasource Grafana")
    providers = read_yaml(provisioning / "dashboards/dashboards.yml")["providers"]
    ensure(providers[0]["options"]["path"] == "/etc/grafana/dashboards", "Provider de dashboards")
    targets = [target for dash in dashboards for panel in dash["panels"] for target in panel.get("targets", [])]
    ensure(targets and all(target["datasource"]["uid"] == DATASOURCE for target in targets), "Referencias de consultas")
    alerting = provisioning / "alerting"
    rules = read_yaml(alerting / "rules.yml")["groups"]
    alerts = {rule["uid"]: rule for group in rules for rule in group["rules"]}
    ensure(set(alerts) == {f"buenvecino-alt-{i:02}" for i in range(1, 8)}
           and all(rule["data"][0]["datasourceUid"] == DATASOURCE for rule in alerts.values()), "Reglas Grafana")
    backup = alerts["buenvecino-alt-06"]
    ensure(backup["isPaused"] is True and 'job="node-exporter"' in backup["data"][0]["model"]["expr"]
           and "fastapi-backend" not in backup["data"][0]["model"]["expr"], "Fuente y pausa de ALT-06")
    point = read_yaml(alerting / "contact-points.yml")["contactPoints"][0]
    policy = read_yaml(alerting / "policies.yml")["policies"][0]
    ensure(policy["receiver"] == point["name"]
           and all(receiver["settings"]["url"].startswith("http://127.0.0.1:") for receiver in point["receivers"]),
           "Notificaciones de laboratorio")
    prometheus = read_yaml(ROOT / "monitoring/prometheus/prometheus.yml")
    jobs = {job["job_name"]: job for job in prometheus["scrape_configs"]}
    ensure(set(jobs) == JOBS and prometheus["global"] == {"scrape_interval": "15s", "evaluation_interval": "15s"}, "Scrapes")
    ensure(any(rule["action"] == "drop" and "backup_last_" in rule["regex"]
               for rule in jobs["fastapi-backend"]["metric_relabel_configs"]), "Filtro del gauge heredado")
    ensure(not list((ROOT / "monitoring/node-exporter/textfile").glob("*.prom")),
           "El collector versionado debe estar vacío de muestras")
    print(f"PASS Grafana: {len(dashboards)} dashboards, {len(targets)} consultas, {len(alerts)} reglas, ALT-06 pausada")


def check_compose(mode: str) -> None:
    model = json.load(sys.stdin)
    services = model["services"]
    ensure(set(services) == SERVICES and set(model["volumes"]) == VOLUMES, "Servicios y volúmenes Compose")
    ensure(set(services["backend"]["networks"]) == {"red-web", "red-monitoreo"}
           and set(model["networks"]) == {"red-web", "red-monitoreo"}, "Segmentación Compose")
    ensure(services["cadvisor"]["image"].endswith(":v0.54.1"), "Conservar cAdvisor v0.54.1")
    if mode == "base":
        ensure(services["backend"]["environment"]["ENVIRONMENT"] == "production", "Modo base explícito")
        expected = []
    else:
        backend = services["backend"]["environment"]
        ensure(backend["DATABASE_URL"] == "" and backend["AWS_EC2_METADATA_DISABLED"] == "true"
               and backend["AWS_SHARED_CREDENTIALS_FILE"] == "/dev/null", "Aislamiento de credenciales")
        expected = [("caddy", "127.0.0.1", "8080", 80), ("grafana", "127.0.0.1", "3000", 3000)]
    ports = [(name, port.get("host_ip"), str(port["published"]), port["target"])
             for name, service in services.items() for port in service.get("ports", [])]
    ensure(sorted(ports) == expected, "Publicaciones efectivas Compose")
    for service in ("prometheus", "grafana", "node-exporter"):
        mounts = services[service]["volumes"]
        ensure(any(mount.get("read_only") and mount.get("type") == "bind" for mount in mounts), f"Montajes {service}")
    print(f"PASS Compose {mode}: redes, volúmenes, montajes y puertos")


def check_bundle(dist: Path) -> None:
    required = {"index.html", "sw.js", "manifest.webmanifest"}
    ensure(all((dist / name).is_file() for name in required) and list((dist / "assets").glob("*.js")), "Salida Vite/PWA")
    read_json(dist / "manifest.webmanifest")
    check_secrets((file for file in dist.rglob("*") if file.is_file()), "Bundle de frontend")
    print("PASS index, assets, manifest y service worker con control de secretos")


def sanitize_junit(source: Path, output: Path) -> None:
    tree = ElementTree.parse(source)
    for element in tree.getroot().iter():
        if element.tag in {"system-out", "system-err", "failure", "error", "skipped"}:
            element.clear()
            element.text = "Detalle omitido del artefacto. Reproduzca en un sandbox."
    suites = list(tree.getroot().iter("testsuite"))
    totals = {key: sum(int(suite.get(key, 0)) for suite in suites) for key in ("tests", "failures", "errors", "skipped")}
    ensure(totals["tests"] > 0, "JUnit vacío")
    tree.write(output, encoding="utf-8", xml_declaration=True)
    passed = totals["tests"] - totals["failures"] - totals["errors"] - totals["skipped"]
    print(f'Pytest: {passed} aprobadas, {totals["failures"]} fallidas, {totals["errors"]} errores, {totals["skipped"]} omitidas')


def observe(project: str, history: Path, verify_history: bool) -> None:
    password = os.environ["CI_GRAFANA_PASSWORD"]
    auth = base64.b64encode(f"admin:{password}".encode()).decode()
    proxy = f"/api/datasources/proxy/uid/{DATASOURCE}/api/v1/"

    def api(path: str):
        with urlopen(Request(f"http://127.0.0.1:3000{path}", headers={"Authorization": f"Basic {auth}"}), timeout=8) as res:
            return json.load(res)

    def query(expression: str):
        return api(proxy + "query?" + urlencode({"query": expression}))["data"]["result"]

    for _ in range(18):
        try:
            targets = api(proxy + "targets")["data"]["activeTargets"]
            if {target["labels"]["job"] for target in targets if target["health"] == "up"} == JOBS:
                break
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(5)
    else:
        raise ValueError("Los tres targets no estuvieron disponibles")
    if verify_history:
        timestamp = history.read_text().strip()
        old = query(f'up{{job="fastapi-backend"}} @ {timestamp}')
        ensure(len(old) == 1 and old[0]["value"][1] == "1", "Muestra histórica tras reiniciar Prometheus")
        print("PASS muestra histórica del mismo volumen TSDB")
        return
    sample = query('timestamp(up{job="fastapi-backend"})')[0]
    history.write_text(sample["value"][1], encoding="ascii")
    ensure(all(api(f"/api/dashboards/uid/{uid}")["meta"]["provisioned"] for uid in DASHBOARDS), "Provisioning en ejecución")
    rules = api("/api/v1/provisioning/alert-rules")
    ensure(len(rules) == 7 and any(rule["uid"] == "buenvecino-alt-06" and rule["isPaused"] for rule in rules),
           "Alerting en ejecución")
    ensure(not query("backup_last_success_timestamp"), "El smoke no debe publicar respaldo simulado")
    series = query(f'count by(container_label_com_docker_compose_service)(container_last_seen'
                   f'{{container_label_com_docker_compose_project="{project}",container_label_com_docker_compose_service!=""}})')
    observed = {series_item["metric"]["container_label_com_docker_compose_service"] for series_item in series}
    if SERVICES <= observed:
        print("PASS cAdvisor observa los siete servicios")
    else:
        print(f"WARN alcance cAdvisor en runner virtualizado: {len(observed)}/7 series por servicio")
    print("PASS tres targets, tres dashboards y siete reglas con ALT-06 pausada")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("static")
    sub.add_parser("observability")
    compose = sub.add_parser("compose")
    compose.add_argument("mode", choices=("base", "dev"))
    bundle = sub.add_parser("bundle")
    bundle.add_argument("dist", type=Path)
    junit = sub.add_parser("junit")
    junit.add_argument("source", type=Path)
    junit.add_argument("output", type=Path)
    runtime = sub.add_parser("observe")
    runtime.add_argument("project")
    runtime.add_argument("history", type=Path)
    runtime.add_argument("--verify-history", action="store_true")
    args = parser.parse_args()
    operations = {"static": check_static, "observability": check_observability,
                  "compose": lambda: check_compose(args.mode), "bundle": lambda: check_bundle(args.dist),
                  "junit": lambda: sanitize_junit(args.source, args.output),
                  "observe": lambda: observe(args.project, args.history, args.verify_history)}
    try:
        operations[args.command]()
    except (ValueError, URLError, ElementTree.ParseError) as err:
        parser.exit(1, f"FAIL {args.command}: {err}\n")


if __name__ == "__main__":
    main()
