"""Genera fixtures de promtool fuera de la TSDB para las expresiones de Grafana."""

import argparse
from itertools import accumulate
from pathlib import Path

import yaml

POINTS = 131
INTERVAL = "30s"
NODE = 'job="node-exporter",instance="node-exporter:9100",environment="laboratorio"'
BACKEND = 'job="fastapi-backend",instance="backend:8000",environment="laboratorio"'
SALE = BACKEND + ',method="POST",endpoint="/api/v1/ventas"'
DISK = NODE + ',device="/dev/sde",mountpoint="/var/lib",fstype="ext4"'
RULES = Path(__file__).resolve().parents[2] / "grafana/provisioning/alerting/rules.yml"


def sample(name: str, labels: str, values: list[int]) -> dict[str, str]:
    return {"series": f"{name}{{{labels}}}", "values": " ".join(map(str, values))}


def phases(normal: int, incident: int, start: int = 20, end: int = 45) -> list[int]:
    return [normal] * start + [incident] * (end - start) + [normal] * (POINTS - end)


def counter(normal: int, incident: int, start: int = 20, end: int = 45) -> list[int]:
    return list(accumulate(phases(normal, incident, start, end)))


def make_case(
    rule: dict,
    data: list[dict[str, str]],
    expectations: list[tuple[str, int | None]],
    interval: str = INTERVAL,
) -> dict:
    expression = rule["data"][0]["model"]["expr"]
    threshold = rule["data"][1]["model"]["conditions"][0]["evaluator"]["params"][0]
    # Esta expresión de prueba reproduce el umbral, sin provisionar otro evaluador.
    match = f"sum(({expression}) > bool {threshold})"
    return {
        "name": rule["labels"]["codigo"],
        "interval": interval,
        "input_series": data,
        "promql_expr_test": [
            {
                "expr": match,
                "eval_time": instant,
                "exp_samples": [] if value is None else [{"labels": "{}", "value": value}],
            }
            for instant, value in expectations
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Archivo temporal para promtool test rules")
    args = parser.parse_args()
    provisioning = yaml.safe_load(RULES.read_text(encoding="utf-8"))
    rules = {rule["labels"]["codigo"]: rule for group in provisioning["groups"] for rule in group["rules"]}
    transition = [("9m", 0), ("20m", 1), ("30m", 0)]
    product = BACKEND + ',method="GET",endpoint="/api/v1/productos"'

    histogram = [sample("http_request_duration_seconds_count", SALE, counter(1, 1))]
    for bucket in ("0.01", "0.05", "0.1", "0.25", "0.5", "0.75", "1.0", "2.0", "5.0", "+Inf"):
        fast = int(bucket not in {"0.01", "0.05"})
        slow = int(bucket in {"2.0", "5.0", "+Inf"})
        histogram.append(sample(
            "http_request_duration_seconds_bucket", SALE + f',le="{bucket}"', counter(fast, slow, 35, 75)
        ))

    cases = [
        make_case(rules["ALT-01"], [
            sample("node_cpu_seconds_total", NODE + ',cpu="0",mode="idle"', counter(24, 3)),
        ], transition),
        make_case(rules["ALT-02"], [
            sample("node_memory_MemTotal_bytes", NODE, [100] * POINTS),
            sample("node_memory_MemAvailable_bytes", NODE, phases(40, 10)),
        ], transition),
        make_case(rules["ALT-03"], [
            sample("node_filesystem_size_bytes", DISK, [100] * POINTS),
            sample("node_filesystem_avail_bytes", DISK, phases(65, 19)),
            sample("node_filesystem_readonly", DISK, [0] * POINTS),
        ], transition),
        make_case(rules["ALT-05"], histogram, [("2m", None), ("15m", 0), ("35m", 1), ("55m", 0)]),
        make_case(rules["ALT-07"], [
            sample("http_requests_total", product + ',status="200"', counter(10, 9)),
            sample("http_requests_total", product + ',status="500"', counter(0, 1)),
        ], [("30s", None), *transition]),
        make_case(rules["ALT-06"], [
            sample("up", NODE, [1] * 12 + [0] * (POINTS - 12)),
            sample("backup_last_success_timestamp", BACKEND, [900] * POINTS),
        ], [("3m", 1), ("12m", None)]),
        make_case(rules["ALT-06"], [
            sample("up", NODE, [1] * 75),
            sample("backup_last_success_timestamp", NODE, [3600] * 75),
        ], [("2h", 0), ("27h", 0), ("27h30m", 1)], interval="30m"),
    ]
    suite = {"rule_files": [], "evaluation_interval": INTERVAL, "tests": cases}
    args.output.write_text(yaml.safe_dump(suite, sort_keys=False), encoding="utf-8")


if __name__ == "__main__":
    main()
