#!/usr/bin/env python3
"""Ejecuta el ciclo CD con un registro loopback, PostgreSQL ausente y datos fixture."""

import argparse
import json
import os
import platform
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from release import (  # noqa: E402
    ARCH, HTTP, LAB_PROJECTS, OWNER_LABEL, PROJECT, ROOT, VOLUMES, Lab, atomic_json,
    configuration_digest, digest_bytes, digest_file, exclusive_lock, overlay, require_local_engine, snapshot_files,
)

REGISTRY = "registry@sha256:82f6ff4a7f982960c8aa51617fea3aabc485df6e55cce80d22deb1de36f1bc3c"
BACKEND = r"""import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        mode = os.environ["MODE"]
        if self.path == "/ready" and mode == "slow":
            time.sleep(8)
        code, payload = {
            "/health": (503 if mode == "unhealthy" else 200, b"fixture"),
            "/ready": (503 if mode == "unready" else 200, b"fixture"),
            "/api/v1/productos": (401, b"fixture"),
            "/metrics": (200, b"# TYPE init008_fixture_up gauge\ninit008_fixture_up 1\n"),
        }.get(self.path, (404, b"fixture"))
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except BrokenPipeError:
            pass

ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
"""


def cmd(*args, expect=0, timeout=240):
    action = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                            errors="replace", timeout=timeout, check=False)
    if action.returncode != expect:
        raise RuntimeError(f"Comando falló ({action.returncode}, esperado {expect})\n{action.stdout}\n{action.stderr}")
    return action.stdout.strip()


def docker(*args, **kwargs):
    return cmd("docker", *args, **kwargs)


def fixture_images(root, lab, registry_name, release_id, mode):
    context = root / "build"
    context.mkdir(exist_ok=True)
    images = {}
    for part in ("backend", "frontend"):
        if part == "backend":
            base = next(line.split()[1] for line in (ROOT / "backend/Dockerfile").read_text().splitlines() if line.startswith("FROM python:"))
            (context / "app.py").write_text(BACKEND, encoding="ascii")
            recipe = (f"FROM {base}\nCOPY app.py /fixture.py\nENV MODE={mode}\n"
                      "HEALTHCHECK --interval=1s --timeout=1s --retries=2 "
                      "CMD [\"python\",\"-c\",\"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=0.6)\"]\n"
                      "CMD [\"python\",\"/fixture.py\"]\n")
        else:
            base = next(line.split()[1] for line in (ROOT / "frontend/Dockerfile").read_text().splitlines() if line.startswith("FROM nginx:"))
            (context / "index.html").write_text(
                f'<html><body><div id="root">{release_id}</div><script src="/assets/fixture.js"></script></body></html>', encoding="ascii")
            shutil.copyfile(ROOT / "frontend/nginx.conf", context / "nginx.conf")
            recipe = (f"FROM {base}\nCOPY index.html /usr/share/nginx/html/index.html\n"
                      "COPY nginx.conf /etc/nginx/conf.d/default.conf\n"
                      "HEALTHCHECK --interval=1s --timeout=1s --retries=4 "
                      "CMD [\"wget\",\"-qO\",\"/dev/null\",\"http://127.0.0.1/index.html\"]\n")
        (context / "Dockerfile").write_text(recipe, encoding="ascii")
        tag = f'{lab["registry"]}/init008/{part}:{release_id}'
        docker("build", "--network", "none", "--provenance=false", "--label", f'{OWNER_LABEL}={lab["owner"]}',
               "--label", f"com.buenvecino.init008.release={release_id}", "-t", tag, str(context))
        push = docker("push", tag)
        remote = subprocess.check_output(["docker", "exec", registry_name, "wget", "-qO-",
            "--header", "Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
            f'http://{lab["registry"]}/v2/init008/{part}/manifests/{release_id}'], timeout=10)
        digest = digest_bytes(remote)
        if not re.search(rf"digest: {digest} size:", push):
            raise RuntimeError("Digest no coincide con el registro del laboratorio")
        images[part] = f'{lab["registry"]}/init008/{part}@{digest}'
    return images


def manifest(root, lab, release_id, images, **overrides):
    path = root / "releases" / release_id
    checksums = {}
    for name in snapshot_files():
        target = path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
        checksums[name] = digest_file(target)
    overlay_name = "deploy/fixture-owner.json"
    atomic_json(path / overlay_name, overlay(lab["owner"]))
    checksums[overlay_name] = digest_file(path / overlay_name)
    document = path / "manifest.json"
    atomic_json(document, {
        "format": "init008-local-fixture", "id": release_id, "architecture": lab["architecture"], "images": images,
        "configuration": checksums, "configuration_sha256": configuration_digest(checksums), "schema": lab["schema"],
        **overrides,
    })
    return digest_file(document)


def check(condition, message):
    if not condition:
        raise RuntimeError(message)
    print(f"PASS {message}", flush=True)


def measure(operation, action):
    """Mide desde el cliente del host, independiente del stack observado."""
    samples = []
    done = threading.Event()
    ready = threading.Event()
    start = time.monotonic()

    def sample():
        mark = datetime.now(UTC).isoformat(timespec="milliseconds")
        tick = time.monotonic()
        row = {"utc": mark, "elapsed_s": round(tick - start, 3)}
        for key, path, expected in (("spa", "/", b'id="root"'), ("health", "/health", b"fixture")):
            began = time.monotonic()
            status, functional = 0, False
            try:
                probe = Request("http://127.0.0.1:8080" + path, headers={"Host": "localhost:8080"})
                with HTTP.open(probe, timeout=0.4) as response:
                    status = response.status
                    functional = status == 200 and expected in response.read(8192)
            except HTTPError as error:
                status = error.code
                error.close()
            except (OSError, URLError):
                pass
            row[key] = {"http": status, "ok": functional, "ms": round(1000 * (time.monotonic() - began), 2)}
        row["ok"] = row["spa"]["ok"] and row["health"]["ok"]
        samples.append(row)
        return tick

    def collect():
        while not done.is_set():
            tick = sample()
            ready.set()
            done.wait(max(0, 1 - (time.monotonic() - tick)))

    observer = threading.Thread(target=collect, daemon=True)
    observer.start()
    try:
        check(ready.wait(5) and samples[0]["ok"], "línea base de disponibilidad desde el host")
        begin = time.monotonic()
        action()
        operation_seconds = round(time.monotonic() - begin, 3)
    finally:
        done.set()
        observer.join(timeout=3)
    sample()
    check(samples[-1]["ok"], "recuperación funcional desde el host")
    return {"operation": operation, "operation_seconds": operation_seconds, "samples": samples}


def lifecycle(root, cfg, registry_name, project=PROJECT, availability=None):
    lab = Lab(root, 90, project)
    lab.preflight()
    base = (sys.executable, "-B", str(ROOT / "deploy/scripts/release.py"))
    common = ("--environment", "laboratory", "--root", str(root), "--project", project)
    releases = {}

    def deploy_args(release_id, *args):
        return (*base, "deploy", *common, "--release", release_id, "--approve-sha256", releases[release_id], *args)

    def deploy(release_id, *args, expect=0):
        result = cmd(*deploy_args(release_id, *args), expect=expect)
        print(result, flush=True)
        return result

    def rollback(*args, expect=0):
        result = cmd(*base, "rollback", *common, *args, expect=expect)
        print(result, flush=True)
        return result

    pairs = {}
    cases = [("release-a", "ok"), ("release-b", "ok")]
    if availability is None:
        cases.extend((("unready", "unready"), ("unhealthy", "unhealthy"), ("slow", "slow")))
    for release_id, mode in cases:
        pairs[release_id] = fixture_images(root, cfg, registry_name, release_id, mode)
        releases[release_id] = manifest(root, cfg, release_id, pairs[release_id])
        print(f"OCI {release_id} " + json.dumps({key: ref.split("@")[1] for key, ref in pairs[release_id].items()}), flush=True)

    baseline = set(root.iterdir())
    dry = deploy("release-a")
    check("DRY RUN" in dry and baseline == set(root.iterdir()), "dry-run sin archivos nuevos ni estado")
    with exclusive_lock(root / "release.lock"):
        check("lock" in deploy("release-a", "--apply", expect=3), "exclusión mutua")
    check("versión confirmada" in rollback("--apply", expect=3), "rechazo de rollback inicial")
    check("BLOCKED" in cmd(*base, "deploy", "--environment", "production", "--apply", expect=3), "gate del orquestador productivo")

    deploy("release-a", "--apply")
    check(lab.state()["current"]["id"] == "release-a" and lab.state()["previous"] is None, "activación inicial de A")
    marker = "/app/app/ml/artifacts/fixture-continuity.txt"
    a = lab.load(lab.state()["current"])
    lab.compose(a, "exec", "-T", "backend", "python", "-c",
                f"from pathlib import Path; Path({marker!r}).write_text('init008')", stage="escritura fixture")
    names = sorted(f"{project}_{volume}" for volume in VOLUMES)
    creation = docker("volume", "inspect", "--format", "{{.Name}} {{.CreatedAt}}", *names)
    if availability is not None:
        update = measure("A-to-B", lambda: deploy("release-b", "--apply"))
        check(lab.state()["current"]["id"] == "release-b", "B confirmada")
        restore = measure("B-to-A", lambda: rollback("--apply"))
        check(lab.state()["current"]["id"] == "release-a" and lab.state()["previous"]["id"] == "release-b", "A confirmada")
        marker_value = lab.compose(a, "exec", "-T", "backend", "cat", marker, stage="verificación fixture")
        check(marker_value == "init008" and creation == docker("volume", "inspect", "--format", "{{.Name}} {{.CreatedAt}}", *names),
              "marcador ML y cinco volúmenes conservados")
        atomic_json(availability, {"interval_seconds": 1, "project": project, "transitions": [update, restore]})
        return
    deploy("release-b", "--apply")
    stable = lab.state()
    check(stable["current"]["id"] == "release-b" and stable["previous"]["id"] == "release-a", "actualización B y conservación de A")
    with HTTP.open("http://localhost:8080/", timeout=4) as response:
        check(b"release-b" in response.read(), "identificación de B a través de Caddy")
    check("already-current" in deploy("release-b", "--apply") and lab.state() == stable, "repetición idempotente de B")

    invalid_ref = {**pairs["release-a"], "backend": f'{cfg["registry"]}/init008/backend:latest'}
    absent = {**pairs["release-a"], "backend": f'{cfg["registry"]}/init008/backend@{digest_bytes(b"init008 absent manifest fixture")}'}
    releases["mutable"] = manifest(root, cfg, "mutable", invalid_ref)
    releases["absent"] = manifest(root, cfg, "absent", absent)
    releases["wrong-arch"] = manifest(root, cfg, "wrong-arch", pairs["release-a"], architecture="linux/unsupported")
    releases["schema"] = manifest(root, cfg, "schema", pairs["release-a"], schema="fixture-v2")
    releases["bad-config"] = manifest(root, cfg, "bad-config", pairs["release-a"])
    (root / "releases/bad-config/deploy/Caddyfile").write_text("invalid", encoding="ascii")
    for release_id, expected in (("mutable", 2), ("absent", 4), ("wrong-arch", 2), ("schema", 3), ("bad-config", 2)):
        deploy(release_id, "--apply", expect=expected)
        check(lab.state() == stable, f"rechazo de {release_id} sin cambiar B")
    for release_id in ("unready", "unhealthy", "slow"):
        check("auto-recovered" in deploy(release_id, "--apply", expect=4) and lab.state() == stable,
              f"recuperación automática de B tras {release_id}")

    log = root / "interruption.log"
    with log.open("w", encoding="utf-8") as stream:
        child = subprocess.Popen(deploy_args("slow", "--apply"), stdout=stream, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 115
            while child.poll() is None and time.monotonic() < deadline:
                if "CHECK health y readiness de fixture" in log.read_text(encoding="utf-8"):
                    child.kill()
                    break
                time.sleep(0.1)
        finally:
            if child.poll() is None:
                child.kill()
            child.wait(timeout=10)
    check(lab.state()["pending"] is not None and lab.state()["current"] == stable["current"],
          "terminación controlada con diario pendiente y B confirmado")
    check("Transición pendiente" in rollback("--apply", expect=3), "transición pendiente bloquea rollback ordinario")
    check("recovered-interruption" in rollback("--recover", "--apply") and lab.state() == stable, "recuperación del diario a B")
    rollback("--apply")
    check(lab.state()["current"]["id"] == "release-a" and lab.state()["previous"]["id"] == "release-b", "rollback explícito B a A")
    marker_value = lab.compose(a, "exec", "-T", "backend", "cat", marker, stage="verificación fixture")
    check(marker_value == "init008" and creation == docker("volume", "inspect", "--format", "{{.Name}} {{.CreatedAt}}", *names),
          "marcador ML y cinco volúmenes conservados")


def main():
    os.environ["PYTHONUTF8"] = "1"
    parser = argparse.ArgumentParser(description=__doc__)
    roots = parser.add_mutually_exclusive_group()
    roots.add_argument("--root", type=Path, help="Directorio absoluto vacío y privado; se conserva para evidencia")
    roots.add_argument("--resume-initial", type=Path, help="Reutilizar únicamente un laboratorio previo sin versión confirmada")
    parser.add_argument("--project", choices=LAB_PROJECTS, default=PROJECT)
    parser.add_argument("--measure-availability", type=Path, help="Solo A, B y rollback, con sondeo desde el host")
    args = parser.parse_args()
    root = (args.resume_initial or args.root or Path(tempfile.mkdtemp(prefix=args.project + "-"))).resolve()
    if args.resume_initial:
        existing = Lab(root, 90, args.project)
        if any(existing.state().values()):
            parser.error("El laboratorio ya tiene versión confirmada o una transición pendiente")
        owner = existing.lab["owner"]
        address = existing.lab["registry"]
    else:
        if not root.is_dir() or any(root.iterdir()) or root.is_relative_to(ROOT.resolve()):
            parser.error("Use un directorio temporal vacío fuera del repositorio")
        owner = uuid4().hex
        address = f"127.0.0.1:{49152 + secrets.randbelow(10000)}"
    name = f"{args.project}-registry-{owner[:8]}"
    print(f"LAB {root}", flush=True)
    require_local_engine(docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}"), os.environ)
    docker("run", "-d", "--rm", "--name", name, "--label", f"{OWNER_LABEL}={owner}", "--network", "host",
           "-e", f"REGISTRY_HTTP_ADDR={address}", "--tmpfs", "/var/lib/registry", REGISTRY)
    try:
        for attempt in range(12):
            try:
                docker("exec", name, "wget", "-qO-", f"http://{address}/v2/")
                break
            except RuntimeError:
                if attempt == 11:
                    raise
                time.sleep(0.5)
        cfg = {"owner": owner, "registry": address, "architecture": f"linux/{ARCH[platform.machine().lower()]}", "schema": "fixture-v1"}
        if not args.resume_initial:
            atomic_json(root / "lab.json", cfg)
            with os.fdopen(os.open(root / "lab.env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as stream:
                stream.write(f"SECRET_KEY=fixture-{uuid4().hex}\nGRAFANA_ADMIN_PASSWORD=fixture-{uuid4().hex}\n")
            (root / "textfile").mkdir()
        lifecycle(root, cfg, name, args.project, args.measure_availability)
    finally:
        containers = docker("ps", "-q", "--filter", f"label={OWNER_LABEL}={owner}",
                            "--filter", f"label=com.docker.compose.project={args.project}")
        if containers:
            docker("stop", *containers.splitlines())
        docker("stop", name)
        print("STOP servicios propios; volúmenes conservados", flush=True)


if __name__ == "__main__":
    main()
