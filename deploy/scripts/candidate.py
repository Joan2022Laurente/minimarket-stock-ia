"""Contrato del candidato OCI entre CI, GHCR y la futura promoción."""

import argparse
import hashlib
import json
import os
import re
import sys
import tarfile
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPONENTS = ("backend", "frontend")
REPORTS = (*COMPONENTS, "frontend-lock")
SEVERITIES = ("UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL")
CONFIG = (
    ".github/workflows/ci.yml", ".github/workflows/publish.yml",
    "deploy/docker-compose.yml", "deploy/docker-compose.dev.yml", "deploy/Caddyfile",
    "deploy/Caddyfile.dev", "deploy/Caddyfile.common", "monitoring/prometheus/prometheus.yml",
    "monitoring/grafana/provisioning/alerting/rules.yml",
    "backend/Dockerfile", "frontend/Dockerfile", "frontend/package-lock.json", "frontend/tests-e2e/package-lock.json",
)
BLOCKERS = [
    "INIT-001: autenticación persistente, demo/JWT y RBAC",
    "INIT-001: PostgreSQL fail-closed, /ready y permisos efectivos",
    "INIT-001: autorización de comprobantes",
    "INIT-005: S3 real, activación de ALT-06 y continuidad en EC2",
    "INIT-007/008: arquitectura aprobada, despliegue, rollback y go-live",
]


def require(condition, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def digest_file(path: Path) -> str:
    with path.open("rb") as stream:
        return "sha256:" + hashlib.file_digest(stream, "sha256").hexdigest()


def read_oci(path: Path) -> dict:
    with tarfile.open(path, "r:*") as archive:
        def read(name: str) -> bytes:
            member = archive.getmember(name)
            require(member.isfile() and member.size < 2_000_000, "Metadata OCI inválida")
            with archive.extractfile(member) as stream:
                return stream.read()

        def blob(digest: str) -> dict:
            require(re.fullmatch(r"sha256:[a-f0-9]{64}", digest), "Digest OCI inválido")
            raw = read(f'blobs/sha256/{digest.split(":", 1)[1]}')
            require(digest_bytes(raw) == digest, "La metadata OCI no coincide con su digest")
            return json.loads(raw)

        manifests = json.loads(read("index.json"))["manifests"]
        require(len(manifests) == 1, "Se espera un solo manifesto OCI nativo")
        manifest_digest = manifests[0]["digest"]
        manifest = blob(manifest_digest)
        require(manifest["mediaType"] == "application/vnd.oci.image.manifest.v1+json", "Manifest OCI inválido")
        config_digest = manifest["config"]["digest"]
        config = blob(config_digest)
        return {
            "digest": manifest_digest, "config_digest": config_digest,
            "architecture": f'{config["os"]}/{config["architecture"]}',
            "labels": config["config"].get("Labels", {}),
            "layers": config["rootfs"]["diff_ids"],
        }


def check_loaded_image(oci: dict, docker_archive: Path) -> None:
    with tarfile.open(docker_archive, "r:*") as archive:
        manifest = json.load(archive.extractfile("manifest.json"))
        require(len(manifest) == 1, "Archivo Docker debe contener una imagen")
        raw = archive.extractfile(manifest[0]["Config"]).read()
        require(digest_bytes(raw) == oci["config_digest"], "La configuración Docker difiere de la del OCI")
    loaded = json.load(sys.stdin)[0]
    require(loaded["RootFS"]["Layers"] == oci["layers"]
            and f'{loaded["Os"]}/{loaded["Architecture"]}' == oci["architecture"]
            and all(loaded["Config"]["Labels"].get(key) == value for key, value in oci["labels"].items()),
            "Las capas o la identidad de la imagen cargada difieren del OCI")


def reports(work: Path) -> dict:
    result = {}
    for name in REPORTS:
        path = work / "reports" / f"{name}.json"
        if not path.is_file():
            result[name] = {"status": "not_run"}
            continue
        report = json.loads(path.read_text(encoding="utf-8"))
        require(report.get("SchemaVersion") == 2 and report.get("Results"), f"Reporte Trivy inválido de {name}")
        require(report["ArtifactType"] == ("container_image" if name in COMPONENTS else "filesystem"),
                f"Tipo de reporte Trivy inesperado para {name}")
        counts = dict.fromkeys(SEVERITIES, 0)
        for target in report["Results"]:
            for item in (target.get("Vulnerabilities") or []) + (target.get("Misconfigurations") or []):
                if item.get("Status") == "PASS":
                    continue
                severity = item.get("Severity")
                counts[severity if severity in counts else "UNKNOWN"] += 1
        result[name] = {"status": "scanned", "severity": counts, "report_sha256": digest_file(path)}
        if name in COMPONENTS:
            result[name]["image_config_digest"] = report["Metadata"]["ImageID"]
    return result


def create(
    work: Path, repository: str, revision: str, arch: str, source: str, tests: str,
    build_run: tuple[int, int] | None = None,
) -> dict:
    require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository), "Repositorio inválido")
    require(re.fullmatch(r"[0-9a-f]{40}", revision) and arch in ("amd64", "arm64"), "SHA o plataforma inválida")
    build = {"source": source}
    tag = f"candidate-{revision}-{arch}"
    if source == "github-actions":
        require(revision == os.getenv("GITHUB_SHA") and repository == os.getenv("GITHUB_REPOSITORY"), "Contexto CI incoherente")
        run_id, attempt = build_run or (int(os.environ["GITHUB_RUN_ID"]), int(os.environ["GITHUB_RUN_ATTEMPT"]))
        require(run_id > 0 and attempt is not None and attempt > 0, "Identificador CI inválido")
        build.update({"run_id": run_id, "attempt": attempt})
        tag += f"-{run_id}-{attempt}"
    scan = reports(work)
    scan_ok = all(report["status"] == "scanned" and report["severity"]["CRITICAL"] == 0 for report in scan.values())
    doc = {
        "schema_version": 1,
        "environment": "candidate",
        "repository": repository,
        "git_sha": revision,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "build": build,
        "architecture": f"linux/{arch}",
        "tests": {"status": tests},
        "scan": scan,
        "state": "validated" if tests == "passed" and scan_ok else "blocked",
        "registry_verified": False,
        "production_approved": False,
        "production_blockers": BLOCKERS,
        "configuration": {file: digest_file(ROOT / file) for file in CONFIG},
    }
    for part in COMPONENTS:
        archive = work / f"{part}.oci.tar"
        data = read_oci(archive)
        require(data["architecture"] == doc["architecture"] and data["labels"]["org.opencontainers.image.revision"] == revision
                and data["labels"]["org.opencontainers.image.source"] == f"https://github.com/{repository}",
                f"Identidad de imagen OCI: {part}")
        require(scan[part]["status"] != "scanned" or scan[part]["image_config_digest"] == data["config_digest"],
                f"El escaneo Trivy pertenece a otra imagen: {part}")
        doc[part] = {
            "image": f"ghcr.io/{repository.lower()}-{part}:{tag}",
            "digest": data["digest"],
            "config_digest": data["config_digest"],
            "archive_sha256": digest_file(archive),
        }
    return doc


def verify(work: Path, args) -> None:
    doc = json.loads((work / "candidate.json").read_text(encoding="utf-8"))
    source = "github-actions" if args.run_id else "working-tree"
    before = doc["generated_at"]
    require(datetime.fromisoformat(before).utcoffset().total_seconds() == 0, "Fecha de candidato debe usar UTC")
    build_run = (args.run_id, args.attempt) if args.run_id else None
    expected = create(work, args.repository, args.sha, args.arch, source, doc["tests"]["status"], build_run)
    expected["generated_at"] = before
    require(doc == expected, "Manifiesto no coincide con contexto, reportes, archivos o imágenes")
    if args.run_id:
        require(doc["build"]["run_id"] == args.run_id and doc["build"]["attempt"] == args.attempt
                and doc["state"] == "validated" and doc["tests"]["status"] == "passed",
                "El candidato no pertenece a la ejecución CI aprobada o está bloqueado")
    print(f'PASS contrato candidato ({doc["state"]}) y digests OCI')


def verify_release(doc: dict, repository: str, revision: str, arch: str, publish_run: int) -> dict[str, str]:
    """Comprueba un release.json de un run de publicación conocido, sin consultar GHCR."""
    require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository), "Repositorio inválido")
    require(re.fullmatch(r"[0-9a-f]{40}", revision) and arch in ("amd64", "arm64"),
            "SHA o arquitectura inválidos")
    require(type(doc["schema_version"]) is int and doc["schema_version"] == 1 and doc["environment"] == "candidate"
            and doc["state"] == "published-candidate" and doc["registry_verified"] is True
            and doc["production_approved"] is False, "Se requiere un candidato publicado para laboratorio")
    require(doc["repository"].lower() == repository.lower() and doc["git_sha"] == revision
            and doc["architecture"] == f"linux/{arch}", "El candidato no coincide con repositorio, SHA o arquitectura")
    require(type(doc["publication"]["run_id"]) is int and doc["publication"]["run_id"] == publish_run > 0,
            "El run de publicación no coincide")
    for timestamp in (doc["generated_at"], doc["publication"]["recorded_at"]):
        require(timestamp.endswith("Z") and datetime.fromisoformat(timestamp).utcoffset().total_seconds() == 0,
                "Fecha de release debe usar UTC")
    build = doc["build"]
    require(build["source"] == "github-actions"
            and all(type(build[key]) is int and build[key] > 0 for key in ("run_id", "attempt"))
            and doc["tests"]["status"] == "passed", "El origen o resultado CI no cumple el contrato")
    require(set(doc["configuration"]) == set(CONFIG)
            and all(digest_file(ROOT / file) == doc["configuration"][file] for file in CONFIG),
            "Los archivos del checkout difieren de la configuración probada")
    require(set(doc["scan"]) == set(REPORTS), "Faltan reportes del candidato")
    for report in doc["scan"].values():
        require(report["status"] == "scanned" and set(report["severity"]) == set(SEVERITIES)
                and all(type(count) is int and count >= 0 for count in report["severity"].values())
                and report["severity"]["CRITICAL"] == 0, "Escaneo incompleto o con CRITICAL")
    refs = {}
    for component in COMPONENTS:
        image = doc[component]
        path = f"ghcr.io/{repository.lower()}-{component}"
        tag = f'candidate-{revision}-{arch}-{build["run_id"]}-{build["attempt"]}'
        require(image["image"] == f"{path}:{tag}", f"Etiqueta de origen inválida para {component}")
        require(all(re.fullmatch(r"sha256:[a-f0-9]{64}", image[field])
                    for field in ("digest", "config_digest", "archive_sha256")), f"Digests inválidos para {component}")
        require(doc["scan"][component]["image_config_digest"] == image["config_digest"],
                f"Escaneo de otra configuración para {component}")
        refs[f"{component.upper()}_IMAGE"] = f'{path}@{image["digest"]}'
    return refs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("archive", type=Path)
    inspect.add_argument("--docker-archive", type=Path, help="Verificar configuración y docker image inspect desde stdin")
    release = commands.add_parser("verify-release", help="Verificar un release.json candidato para laboratorio")
    release.add_argument("release", type=Path)
    release.add_argument("--repository", required=True)
    release.add_argument("--sha", required=True)
    release.add_argument("--arch", choices=("amd64", "arm64"), required=True)
    release.add_argument("--publish-run", type=int, required=True)
    release.add_argument("--purpose", choices=("laboratory", "production"), default="laboratory")
    for name in ("create", "verify"):
        command = commands.add_parser(name)
        command.add_argument("work", type=Path)
        command.add_argument("--repository", required=True)
        command.add_argument("--sha", required=True)
        command.add_argument("--arch", choices=("amd64", "arm64"), required=True)
        if name == "create":
            command.add_argument("--source", choices=("github-actions", "working-tree"), required=True)
            command.add_argument("--tests", choices=("passed", "not_run"), required=True)
        else:
            command.add_argument("--run-id", type=int)
            command.add_argument("--attempt", type=int)
    args = parser.parse_args()
    try:
        if args.command == "inspect":
            image = read_oci(args.archive)
            if args.docker_archive:
                check_loaded_image(image, args.docker_archive)
            print(f'PASS {image["architecture"]} OCI {image["digest"]} config {image["config_digest"]}')
        elif args.command == "create":
            doc = create(args.work, args.repository, args.sha, args.arch, args.source, args.tests)
            (args.work / "candidate.json").write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
            for target, result in doc["scan"].items():
                print(f'{target}: {result["status"]} {result.get("severity", {})}')
            print(f'Candidato: {doc["state"]}')
            if args.source == "github-actions" and doc["state"] != "validated":
                parser.exit(1, "CRITICAL, escaneo incompleto o pruebas pendientes bloquean la publicación.\n")
        elif args.command == "verify-release":
            if args.purpose == "production":
                parser.exit(3, "BLOCKED promoción productiva: INIT-001 pendiente.\n")
            doc = json.loads(args.release.read_text(encoding="utf-8"))
            refs = verify_release(doc, args.repository, args.sha, args.arch, args.publish_run)
            print(json.dumps(refs))
        else:
            verify(args.work, args)
    except (KeyError, OSError, ValueError, TypeError, AttributeError, tarfile.TarError) as error:
        parser.exit(1, f"FAIL contrato candidato: {error}\n")


if __name__ == "__main__":
    main()
