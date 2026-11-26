"""Exporta evidencia Trivy sanitizada y comprueba el vínculo con los ImageID locales."""

import argparse
import csv
import hashlib
import json
import subprocess
import tarfile
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

LEVELS = ("CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN")
COLUMNS = ("componente", "clase", "paquete", "id", "severidad", "version_afectada", "version_corregida",
           "aplicabilidad", "recomendacion", "responsable", "estado", "fuente")


def rows(component, report):
    for target in report.get("Results", []):
        for finding in target.get("Vulnerabilities") or []:
            fixed = finding.get("FixedVersion", "")
            yield {
                "componente": component, "clase": target.get("Class", ""), "paquete": finding["PkgName"],
                "id": finding["VulnerabilityID"], "severidad": finding["Severity"],
                "version_afectada": finding["InstalledVersion"], "version_corregida": fixed,
                "aplicabilidad": "Presente en dependencias; alcance en runtime por revisar",
                "recomendacion": "Revisar parche y verificar imagen nueva" if fixed else "Consultar al mantenedor y revisar riesgo",
                "responsable": "Desarrollo" if target.get("Class") == "lang-pkgs" else "DevOps",
                "estado": "Abierto", "fuente": finding.get("PrimaryURL", ""),
            }
        for finding in target.get("Misconfigurations") or []:
            if finding.get("Status") == "FAIL":
                yield {
                    "componente": component, "clase": "image-config", "paquete": "Configuración OCI",
                    "id": finding["ID"], "severidad": finding["Severity"], "version_afectada": "",
                    "version_corregida": "", "aplicabilidad": "Detectada en configuración de imagen",
                    "recomendacion": "Revisar control y comprobar su aplicación sobre la imagen",
                    "responsable": "DevOps", "estado": "Abierto",
                    "fuente": finding.get("PrimaryURL", ""),
                }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", type=Path)
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    summary = {"utc": datetime.now(UTC).isoformat(), "reports": {}}
    findings = []
    for component in ("backend", "frontend", "frontend-lock"):
        raw = json.loads((args.reports / f"{component}.json").read_text(encoding="utf-8"))
        if raw["SchemaVersion"] != 2 or raw["ArtifactType"] != ("filesystem" if component == "frontend-lock" else "container_image"):
            raise ValueError("Formato de Trivy inesperado")
        report = {}
        if component != "frontend-lock":
            tag = f"minimarket-{component}:buenvecino-init009"
            image = json.loads(subprocess.check_output(["docker", "image", "inspect", tag]))[0]
            with tarfile.open(args.reports.parent / f"{component}.docker.tar") as archive:
                index = json.load(archive.extractfile("index.json"))["manifests"]
                manifest = next(item for item in json.load(archive.extractfile("manifest.json")) if tag in item["RepoTags"])
                config = "sha256:" + hashlib.sha256(archive.extractfile(manifest["Config"]).read()).hexdigest()
            if (image["Id"] not in {item["digest"] for item in index}
                    or config != raw["Metadata"]["ImageID"]
                    or image["RootFS"]["Layers"] != raw["Metadata"]["DiffIDs"]):
                raise ValueError(f"Trivy no examinó la imagen ejecutada de {component}")
            report.update(tag=tag, local_index_digest=image["Id"], scanned_config_digest=config,
                          architecture=f'{image["Os"]}/{image["Architecture"]}')
        items = list(rows(component, raw))
        counts = Counter(row["severidad"] for row in items)
        report.update(severity={level: counts[level] for level in LEVELS},
                      distinct_ids=len({row["id"] for row in items}))
        summary["reports"][component] = report
        findings.extend(items)
    with (args.evidence / "trivy-matriz.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(findings)
    output = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    (args.evidence / "trivy-resumen.json").write_text(output, encoding="utf-8")
    print(output, end="")


if __name__ == "__main__":
    main()
