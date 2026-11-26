"""Operación transaccional de los fixtures de INIT-008. EC2 permanece bloqueada."""

import argparse
import contextlib
import importlib.util
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

sys.dont_write_bytecode = True

from candidate import COMPONENTS, ROOT, digest_bytes, digest_file
from ec2_preflight import ARCH

probe_spec = importlib.util.spec_from_file_location("probe_spa", Path(__file__).with_name("probe-spa.py"))
probe_module = importlib.util.module_from_spec(probe_spec)
probe_spec.loader.exec_module(probe_module)

PROJECT = "buenvecino-init008"
LAB_PROJECTS = (PROJECT, "buenvecino-init009-release")
OWNER_LABEL = "com.buenvecino.init008.lab"
SERVICES = {"backend", "frontend", "caddy", "prometheus", "grafana", "node-exporter", "cadvisor"}
VOLUMES = {"ml_artifacts", "prometheus_data", "grafana_data", "caddy_data", "caddy_config"}
RELEASE_ID = r"[a-z0-9][a-z0-9-]{0,31}"
DIGEST = r"sha256:[0-9a-f]{64}"
BASE_FILES = (
    "deploy/docker-compose.yml", "deploy/docker-compose.dev.yml", "deploy/Caddyfile", "deploy/Caddyfile.dev",
    "deploy/Caddyfile.common", "deploy/scripts/caddy-production.sh", "monitoring/prometheus/prometheus.yml",
)
HTTP = build_opener(ProxyHandler({}), probe_module.RejectRedirects())


class ReleaseError(Exception):
    def __init__(self, message: str, code: int = 2):
        super().__init__(message)
        self.code = code


def require(condition, message: str, code: int = 2) -> None:
    if not condition:
        raise ReleaseError(message, code)


def snapshot_files() -> tuple[str, ...]:
    grafana = ROOT / "monitoring/grafana"
    return BASE_FILES + tuple(sorted(
        path.relative_to(ROOT).as_posix()
        for path in grafana.rglob("*") if path.is_file() and path.suffix in {".json", ".yml"}
    ))


def configuration_digest(files: dict) -> str:
    return digest_bytes(json.dumps(files, sort_keys=True, separators=(",", ":")).encode())


def path_is_direct(path: Path) -> bool:
    return path.resolve() == path and not path.is_symlink()


def read_file(path: Path) -> bytes:
    require(path.is_file() and path_is_direct(path), "Ruta de archivo ausente o indirecta")
    return path.read_bytes()


def read_json(path: Path):
    return json.loads(read_file(path))


def validate_digest(value, pattern: str = DIGEST) -> bool:
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def validate_id(value) -> bool:
    return isinstance(value, str) and re.fullmatch(RELEASE_ID, value) is not None


def overlay(owner: str) -> dict:
    return {
        group: {name: {"labels": {OWNER_LABEL: owner}} for name in sorted(names)}
        for group, names in (("services", SERVICES), ("volumes", VOLUMES), ("networks", {"red-web", "red-monitoreo"}))
    }


def validate_fixture(doc: dict, release_id: str, lab: dict) -> None:
    require(isinstance(doc, dict) and set(doc) == {
        "format", "id", "architecture", "images", "configuration", "configuration_sha256", "schema",
    }, "Manifiesto de fixture incompleto")
    require(doc["format"] == "init008-local-fixture" and doc["id"] == release_id, "Identidad de fixture inválida")
    require(doc["architecture"] == lab["architecture"], "Arquitectura incompatible")
    require(doc["schema"] == lab["schema"], "Esquema incompatible; recuperación de datos requiere revisión", 3)
    require(set(doc["images"]) == set(COMPONENTS), "Par de imágenes incompleto")
    for part in COMPONENTS:
        prefix = re.escape(f'{lab["registry"]}/init008/{part}@')
        require(validate_digest(doc["images"][part], prefix + DIGEST), "Imagen mutable o fuera del registro de fixtures")
    require(set(doc["configuration"]) == {*snapshot_files(), "deploy/fixture-owner.json"}
            and all(validate_digest(value) for value in doc["configuration"].values()), "Inventario de configuración inválido")
    require(doc["configuration_sha256"] == configuration_digest(doc["configuration"]), "SHA de configuración incongruente")


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def atomic_json(path: Path, value: dict) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        if os.name != "nt":
            directory = os.open(path.parent, os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


@contextlib.contextmanager
def exclusive_lock(path: Path):
    require(path_is_direct(path), "Ruta de lock indirecta")
    with path.open("a+b") as stream:
        acquired = False
        try:
            if os.name == "nt":
                import msvcrt
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
        except OSError:
            raise ReleaseError("Otra operación mantiene el lock de despliegue", 3) from None
        if acquired:
            yield


def checked_pointer(pointer: dict) -> None:
    require(isinstance(pointer, dict) and set(pointer) == {"id", "digest"}
            and validate_id(pointer["id"]) and validate_digest(pointer["digest"]), "Puntero de estado inválido")


def http_status(port: int, path: str) -> int:
    try:
        request = Request(f"http://127.0.0.1:{port}{path}", headers={"Host": f"localhost:{port}"})
        with HTTP.open(request, timeout=2) as response:
            return response.status
    except HTTPError as error:
        error.close()
        return error.code
    except (OSError, URLError):
        return 0


class Lab:
    def __init__(self, root: Path, timeout: int, project: str = PROJECT):
        require(project in LAB_PROJECTS, "Proyecto de laboratorio fuera del alcance")
        self.project = project
        require(root.is_absolute() and root.is_dir() and path_is_direct(root)
                and not root.is_relative_to(ROOT.resolve()), "Use una raíz absoluta de fixtures fuera del checkout")
        if os.name != "nt":
            info = root.stat()
            require(info.st_uid == os.geteuid() and not stat.S_IMODE(info.st_mode) & 0o077, "La raíz de laboratorio debe ser privada")
        self.root = root
        self.timeout = timeout
        self.lab = read_json(root / "lab.json")
        require(set(self.lab) == {"owner", "registry", "architecture", "schema"}
                and validate_digest(self.lab["owner"], r"[0-9a-f]{32}")
                and validate_digest(self.lab["registry"], r"127\.0\.0\.1:[1-9][0-9]{0,4}")
                and int(self.lab["registry"].split(":")[1]) <= 65535
                and self.lab["schema"] in {"fixture-v1", "fixture-v2"}
                and self.lab["architecture"] == f'linux/{ARCH.get(platform.machine().lower())}',
                "Marcador de laboratorio o arquitectura inválidos")
        data = read_file(root / "lab.env").decode("ascii")
        lines = data.splitlines()
        fields = [line.partition("=") for line in lines]
        require(len(fields) == 2 and {key for key, _, _ in fields} == {"SECRET_KEY", "GRAFANA_ADMIN_PASSWORD"}
                and all(sep == "=" and re.fullmatch(r"fixture-[a-zA-Z0-9-]{16,80}", val)
                        for _, sep, val in fields), "El env debe ser exclusivo de fixtures")
        if os.name != "nt":
            require(not stat.S_IMODE((root / "lab.env").stat().st_mode) & 0o077, "lab.env requiere permisos privados")
        require((root / "textfile").is_dir() and path_is_direct(root / "textfile"), "Textfile aislado requerido")
        self.env = {
            key: value for key, value in os.environ.items()
            if key.upper() in {
                "PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "WINDIR", "PATHEXT", "TEMP", "TMP", "LANG",
                "DOCKER_CONFIG", "DOCKER_HOST", "DOCKER_CONTEXT", "XDG_RUNTIME_DIR", "LOCALAPPDATA", "APPDATA",
            }
        }
        self.env.update(ENVIRONMENT="development", MONITORING_TEXTFILE_DIR=str(root / "textfile"))

    def docker(self, *args: str, stage: str, env: dict | None = None, timeout: int = 15) -> str:
        try:
            result = subprocess.run(["docker", *args], env=env or self.env, capture_output=True,
                                    text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False)
        except subprocess.TimeoutExpired:
            raise ReleaseError(f"Timeout en {stage}", 4) from None
        except OSError:
            raise ReleaseError("Docker CLI no disponible", 3) from None
        require(result.returncode == 0, f"Falló {stage}", 4)
        return result.stdout.strip()

    def preflight(self) -> None:
        current = self.docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}", stage="contexto Docker")
        require_local_engine(current, self.env)
        actual = self.docker("version", "--format", "{{.Server.Os}}/{{.Server.Arch}}", stage="arquitectura Docker")
        require(actual == self.lab["architecture"], "Engine de arquitectura incompatible", 3)
        version = self.docker("compose", "version", "--short", stage="versión Compose")
        require(bool(re.match(r"^v?2\.", version)), "Se requiere Compose v2", 3)
        resources = json.loads(self.docker("info", "--format", "{{json .}}", stage="capacidad Docker"))
        require(resources["NCPU"] >= 1 and resources["MemTotal"] >= 2 * 1024**3
                and shutil.disk_usage(self.root).free >= 256 * 1024**2, "Capacidad insuficiente para el fixture", 3)
        names = self.docker("ps", "-aq", "--filter", f"label=com.docker.compose.project={self.project}", stage="proyecto Compose")
        if names:
            format_string = '{{index .Config.Labels "' + OWNER_LABEL + '"}}'
            owners = self.docker("inspect", "--format", format_string, *names.splitlines(), stage="propiedad de contenedores")
            require(set(owners.splitlines()) == {self.lab["owner"]}, "Proyecto existente de otro laboratorio", 3)
        for kind, expected in (("volume", VOLUMES), ("network", {"red-web", "red-monitoreo"})):
            names = self.docker(kind, "ls", "--format", "{{.Name}}", stage=f"inventario {kind}")
            owned_names = sorted(set(names.splitlines()) & {f"{self.project}_{name}" for name in expected})
            if owned_names:
                format_string = '{{index .Labels "' + OWNER_LABEL + '"}}'
                owners = self.docker(kind, "inspect", "--format", format_string, *owned_names, stage=f"propiedad {kind}")
                require(set(owners.splitlines()) == {self.lab["owner"]}, f"Recurso {kind} existente de otro laboratorio", 3)

    def state(self) -> dict:
        path = self.root / "state.json"
        if not path.exists() and not path.is_symlink():
            return {"current": None, "previous": None, "pending": None}
        state = read_json(path)
        require(isinstance(state, dict) and set(state) == {"current", "previous", "pending"}, "Estado inválido", 5)
        for slot in ("current", "previous"):
            if state[slot] is not None:
                checked_pointer(state[slot])
        if state["pending"] is not None:
            require(isinstance(state["pending"], dict) and set(state["pending"]) == {"target", "operation", "utc"}
                    and state["pending"]["operation"] in {"deploy", "rollback"}, "Diario de transición inválido", 5)
            checked_pointer(state["pending"]["target"])
        return state

    def record(self, event: str, release: str, started: float) -> None:
        message = {"utc": now(), "event": event, "release": release, "seconds": round(time.monotonic() - started, 3)}
        print(json.dumps(message), flush=True)
        path = self.root / "events.jsonl"
        try:
            require(path_is_direct(path), "Ruta del registro indirecta")
            with path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(message) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
        except (OSError, ReleaseError):
            print("WARN No se pudo persistir el registro; revise state.json.", flush=True)

    def load(self, pointer: dict) -> dict:
        checked_pointer(pointer)
        path = self.root / "releases" / pointer["id"]
        raw = read_file(path / "manifest.json")
        require(digest_bytes(raw) == pointer["digest"], "Manifiesto alterado o aprobación incongruente")
        doc = json.loads(raw)
        validate_fixture(doc, pointer["id"], self.lab)
        for entry in snapshot_files():
            snapshot = read_file(path / entry)
            require(digest_bytes(snapshot) == doc["configuration"][entry], "Snapshot de configuración alterado")
            # INIT-008A solo autoriza el stack fixture del checkout revisado.
            require(snapshot == (ROOT / entry).read_bytes(), "Snapshot fuera del perfil local revisado")
        local_overlay = path / "deploy/fixture-owner.json"
        require(read_json(local_overlay) == overlay(self.lab["owner"])
                and digest_file(local_overlay) == doc["configuration"]["deploy/fixture-owner.json"],
                "Overlay fuera del perfil local revisado")
        return doc

    def compose(self, doc: dict, *args: str, stage: str, timeout: int = 15) -> str:
        config = self.root / "releases" / doc["id"] / "deploy"
        return self.docker("compose", "--project-name", self.project, "--env-file", str(self.root / "lab.env"),
                           "-f", str(config / "docker-compose.yml"), "-f", str(config / "docker-compose.dev.yml"),
                           "-f", str(config / "fixture-owner.json"), *args, stage=stage, timeout=timeout,
                           env={**self.env, **{f"{part.upper()}_IMAGE": doc["images"][part] for part in COMPONENTS}})

    def inspect_model(self, doc: dict) -> None:
        config = json.loads(self.compose(doc, "config", "--format", "json", stage="configuración Compose"))
        services = config["services"]
        require(set(services) == SERVICES and set(config["networks"]) == {"red-web", "red-monitoreo"}
                and set(config["volumes"]) == VOLUMES, "Topología fixture inesperada")
        ports = sorted((name, port.get("host_ip"), str(port["published"]), port["target"])
                       for name, service in services.items() for port in service.get("ports", []))
        require(ports == [("caddy", "127.0.0.1", "8080", 80), ("grafana", "127.0.0.1", "3000", 3000)],
                "Publicaciones Compose fuera de loopback")
        for part in COMPONENTS:
            require(services[part]["image"] == doc["images"][part], "Compose no conserva las referencias por digest")
        env = services["backend"]["environment"]
        require(env["ENVIRONMENT"] == "development" and env["DATABASE_URL"] == ""
                and env["AWS_EC2_METADATA_DISABLED"] == "true", "Compose no está aislado de datos reales")

    def images(self, doc: dict, pull: bool) -> None:
        for part, ref in doc["images"].items():
            if pull:
                self.docker("pull", "--platform", doc["architecture"], ref, stage=f"descarga OCI {part}", timeout=90)
            image = json.loads(self.docker("image", "inspect", ref, stage=f"inspección OCI {part}"))[0]
            require(ref in image.get("RepoDigests", []) and f'{image["Os"]}/{image["Architecture"]}' == doc["architecture"]
                    and image["Config"].get("Labels", {}).get(OWNER_LABEL) == self.lab["owner"]
                    and image["Config"]["Labels"].get("com.buenvecino.init008.release") == doc["id"],
                    f"Digest, arquitectura o procedencia fixture de {part} incongruente")

    def health(self, doc: dict) -> None:
        require(probe_module.probe("http://localhost:8080/", 4)[0], "Falló el sondeo de la SPA", 4)
        for path, expected in (("/health", 200), ("/ready", 200), ("/api/v1/productos", 401), ("/metrics", 404), ("/uploads/fixture", 404)):
            status = http_status(8080, path)
            require(status == expected, f"Falló {path} fixture: HTTP {status}", 4)
        require(http_status(3000, "/api/health") == 200, "Grafana no responde en loopback", 4)
        for part in COMPONENTS:
            container = self.compose(doc, "ps", "-q", part, stage=f"contenedor {part}")
            active = self.docker("inspect", "--format", "{{.Image}}", container, stage=f"imagen activa {part}")
            expected = self.docker("image", "inspect", "--format", "{{.Id}}", doc["images"][part], stage=f"imagen esperada {part}")
            require(active == expected, f"Contenedor {part} no ejecuta la imagen esperada", 4)
        deadline = time.monotonic() + min(self.timeout, 30)
        while True:
            raw = self.compose(doc, "exec", "-T", "prometheus", "wget", "-qO-",
                               "http://127.0.0.1:9090/api/v1/targets", stage="targets Prometheus")
            jobs = {target["labels"]["job"] for target in json.loads(raw)["data"]["activeTargets"] if target["health"] == "up"}
            if jobs == {"fastapi-backend", "node-exporter", "cadvisor"}:
                print("PASS liveness, readiness de fixture, rutas privadas y tres targets", flush=True)
                return
            require(time.monotonic() < deadline, "Prometheus no tiene los tres targets activos dentro del plazo", 4)
            time.sleep(1)

    def activate(self, doc: dict) -> None:
        self.compose(doc, "up", "-d", "--no-build", "--pull", "never", "--wait",
                     "--wait-timeout", str(self.timeout), stage="espera de contenedores Compose", timeout=self.timeout + 15)
        print("CHECK health y readiness de fixture", flush=True)
        self.health(doc)

    def write_state(self, state: dict) -> None:
        path = self.root / "state.json"
        require(path_is_direct(path), "Ruta de estado indirecta", 5)
        try:
            atomic_json(path, state)
        except OSError:
            raise ReleaseError("No se pudo confirmar el estado en disco", 5) from None

    def operate(self, args: argparse.Namespace) -> None:
        started = time.monotonic()
        state = self.state()
        current = state["current"]
        pending = state["pending"]
        require(bool(pending) == args.recover,
                "Transición pendiente: use rollback --recover" if pending else "No hay transición pendiente", 3)
        target = ({"id": args.release, "digest": args.approve_sha256} if args.operation == "deploy"
                  else current if args.recover else state["previous"])
        require(target is not None, "No hay versión confirmada que se pueda recuperar", 3)
        self.preflight()
        doc = self.load(target)
        self.inspect_model(doc)
        if not args.apply:
            print(f"DRY RUN {args.operation} {target['id']} {target['digest']}")
            return

        if args.recover:
            self.images(doc, pull=False)
            try:
                self.activate(doc)
            except (ReleaseError, ValueError, KeyError, TypeError, OSError):
                self.record("critical", target["id"], started)
                raise ReleaseError("Recuperación fallida; se conserva el diario pendiente", 5) from None
            self.write_state({**state, "pending": None})
            self.record("recovered-interruption", target["id"], started)
            return

        if target == current:
            self.images(doc, pull=False)
            self.health(doc)
            self.record("already-current", target["id"], started)
            return

        former = None
        if current:
            former = self.load(current)
            self.inspect_model(former)
            self.images(former, pull=False)
        self.images(doc, pull=True)
        self.write_state({**state, "pending": {"target": target, "operation": args.operation, "utc": now()}})
        try:
            self.activate(doc)
        except (ReleaseError, ValueError, KeyError, TypeError, OSError) as error:
            detail = str(error) if isinstance(error, ReleaseError) else "falló la validación funcional"
            print(f"FAIL {detail}", flush=True)
            try:
                if former:
                    self.timeout = max(self.timeout, 60)
                    self.activate(former)
                else:
                    self.compose(doc, "stop", stage="detención del primer candidato", timeout=45)
                self.write_state(state)
            except (ReleaseError, ValueError, KeyError, TypeError, OSError):
                self.record("critical", target["id"], started)
                raise ReleaseError("Recuperación fallida; se conserva el diario pendiente", 5) from None
            self.record("auto-recovered" if former else "initial-failure-stopped", target["id"], started)
            raise ReleaseError("Candidato rechazado; consulte el resultado de recuperación", 4) from None
        self.write_state({"current": target, "previous": current, "pending": None})
        self.record("deployed" if args.operation == "deploy" else "rolled-back", target["id"], started)


def require_local_engine(context_endpoint: str, environment: dict) -> None:
    actual = context_endpoint if environment.get("DOCKER_CONTEXT") else (environment.get("DOCKER_HOST") or context_endpoint)
    require(actual.startswith(("unix://", "npipe://")), "Solo se permite un Docker Engine local", 3)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("deploy", "rollback"))
    parser.add_argument("--environment", required=True, choices=("laboratory", "ec2-lab", "production"))
    parser.add_argument("--root", type=Path)
    parser.add_argument("--project", choices=LAB_PROJECTS, default=PROJECT)
    execution = parser.add_mutually_exclusive_group()
    execution.add_argument("--apply", action="store_true")
    execution.add_argument("--dry-run", action="store_true")
    parser.add_argument("--release")
    parser.add_argument("--approve-sha256")
    parser.add_argument("--recover", action="store_true")
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()
    try:
        require(args.environment == "laboratory", "BLOCKED: operación remota y productiva deshabilitada", 3)
        require(args.root is not None and 2 <= args.timeout <= 180, "Se requiere --root y timeout entre 2 y 180")
        if args.operation == "deploy":
            require(validate_id(args.release) and validate_digest(args.approve_sha256) and not args.recover,
                    "deploy requiere un release y --approve-sha256 válidos")
        else:
            require(args.release is None and args.approve_sha256 is None, "rollback usa los punteros confirmados")
        lab = Lab(args.root, args.timeout, args.project)
        if args.apply:
            with exclusive_lock(lab.root / "release.lock"):
                lab.operate(args)
        else:
            lab.operate(args)
        return 0
    except ReleaseError as error:
        print(str(error), flush=True)
        return error.code
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        print("Configuración o respuesta inválida; revise el diario de estado.", flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
