"""Preflight EC2 de solo lectura, sin red por defecto."""

import argparse
import http.client
import ipaddress
import json
import math
import os
import platform
import re
import shutil
import socket
import stat
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "infra/aws/infrastructure-contract.example.json"
ARCH = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}
FQDN = r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?"
REGION = r"[a-z]{2}(?:-[a-z0-9]+)+-[0-9]+"
PATHS = (
    "/opt/buenvecino", "/etc/buenvecino", "/var/lib/buenvecino/releases",
    "/var/lib/buenvecino/backup", "/var/lib/buenvecino/textfile",
)


class Results:
    def __init__(self) -> None:
        self.states: list[str] = []

    def report(self, state: str, name: str, detail: str = "") -> None:
        self.states.append(state)
        print(f"{state:<7} {name}" + (f" — {detail}" if detail else ""))

    def check(self, valid: bool, name: str, detail: str = "") -> None:
        self.report("PASS" if valid else "FAIL", name, detail)

    def exit_code(self) -> int:
        if "FAIL" in self.states:
            return 1
        return 3 if "BLOCKED" in self.states else 0


def matches(value, pattern: str) -> bool:
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def positive_int(value) -> bool:
    return type(value) is int and value > 0


def positive_amount(value) -> bool:
    return positive_int(value) or (type(value) is float and math.isfinite(value) and value > 0)


def aws_id(value, prefix: str) -> bool:
    return matches(value, prefix + r"-[a-f0-9]{8}(?:[a-f0-9]{9})?")


def network(value) -> bool:
    try:
        return isinstance(value, str) and isinstance(ipaddress.ip_network(value), ipaddress.IPv4Network)
    except ValueError:
        return False


def ipv4(value) -> bool:
    try:
        return isinstance(value, str) and isinstance(ipaddress.ip_address(value), ipaddress.IPv4Address)
    except ValueError:
        return False


def lab_rules(value) -> bool:
    return isinstance(value, list) and all(
        isinstance(rule, dict) and set(rule) == {"protocol", "port", "source"}
        and rule["protocol"] == "tcp" and rule["port"] == 22
        and network(rule["source"]) and ipaddress.ip_network(rule["source"]).prefixlen > 0
        for rule in value
    )


CHECKS = {
    "aws": {"region": lambda x: matches(x, REGION), "budget_limit_monthly": positive_amount,
            "budget_currency": lambda x: matches(x, "[A-Z]{3}"), "budget_alerts_configured": lambda x: x is True},
    "ec2": {
        "instance_id": lambda x: aws_id(x, "i"), "instance_type": lambda x: matches(x, r"[a-z0-9]+\.[a-z0-9]+"),
        "ami_id": lambda x: aws_id(x, "ami"), "architecture": lambda x: x in ("amd64", "arm64"),
        "os_id": lambda x: matches(x, "[a-z][a-z0-9_-]+"), "os_version": lambda x: matches(x, r"[0-9]+(?:\.[0-9]+)*"),
        "vcpus": positive_int, "ram_mib": positive_int, "min_available_disk_gib": positive_int,
    },
    "ebs": {"volume_id": lambda x: aws_id(x, "vol"), "capacity_gib": positive_int,
            "type": lambda x: x in ("gp2", "gp3", "io1", "io2", "st1", "sc1", "standard"),
            "encrypted": lambda x: x is True},
    "network": {
        "vpc_id": lambda x: aws_id(x, "vpc"), "vpc_cidr": network,
        "subnet_id": lambda x: aws_id(x, "subnet"), "subnet_cidr": network,
        "subnet_kind": lambda x: x in ("public", "private"),
        "private_subnet_id": lambda x: aws_id(x, "subnet"), "internet_gateway_id": lambda x: aws_id(x, "igw"),
        "route_table_id": lambda x: aws_id(x, "rtb"),
        "security_group_ids": lambda x: isinstance(x, list) and bool(x) and all(aws_id(item, "sg") for item in x),
        "lab_ingress": lab_rules, "egress_reviewed": lambda x: x is True,
    },
    "access": {
        "method": lambda x: x in ("ssh", "ssm"), "ssh_admin_cidr": lambda x: network(x) and ipaddress.ip_network(x).prefixlen > 0,
        "public_ipv4": ipv4, "imds_http_tokens": lambda x: x == "required",
        "instance_profile_arn": lambda x: matches(x, r"arn:aws(?:-us-gov|-cn)?:iam::[0-9]{12}:instance-profile/[A-Za-z0-9_+=,.@/-]+"),
    },
    "s3": {
        "backup_lab_bucket": lambda x: matches(x, r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]"),
        "region": lambda x: matches(x, REGION), "block_public_access": lambda x: x is True,
        "encryption": lambda x: x == "AES256", "versioning": lambda x: x == "Enabled",
        "lifecycle_reviewed": lambda x: x is True,
    },
    "dns": {"approved_hostname": lambda x: matches(x, FQDN), "provider": lambda x: matches(x, "[A-Za-z0-9 ._-]{1,60}")},
    "supabase": {"host": lambda x: matches(x, FQDN), "mode": lambda x: x in ("direct", "session-pooler"),
                 "port": lambda x: type(x) is int and x == 5432},
    "ghcr": {"repository": lambda x: matches(x, r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"),
             "visibility": lambda x: x in ("private", "internal"),
             "pull_method": lambda x: x == "approved-read-only", "published_release_run_id": positive_int},
}


def validate_contract(doc, results: Results) -> bool:
    if (not isinstance(doc, dict) or set(doc) != {*CHECKS, "schema_version", "scope"}
            or type(doc["schema_version"]) is not int or doc["schema_version"] != 1 or doc["scope"] != "private-laboratory"):
        results.report("FAIL", "Contrato", "schema/version/scope o campos ajenos al contrato")
        return False
    invalid = False
    for group, definitions in CHECKS.items():
        values = doc[group]
        if not isinstance(values, dict) or set(values) != set(definitions):
            results.report("FAIL", group, "campos faltantes o ajenos al contrato")
            invalid = True
            continue
        pending = []
        incorrect = []
        for field, validate in definitions.items():
            optional = (
                (group == "network" and field == "private_subnet_id")
                or (group == "network" and field == "internet_gateway_id" and values["subnet_kind"] == "private")
                or (group == "access" and field == "public_ipv4")
                or (group == "access" and field == "ssh_admin_cidr" and values["method"] == "ssm")
            )
            if values[field] is None:
                if not optional:
                    pending.append(field)
            elif not validate(values[field]):
                incorrect.append(field)
        if incorrect:
            invalid = True
            results.report("FAIL", group, "revisar " + ", ".join(incorrect))
        if pending:
            results.report("BLOCKED", group, "pendiente " + ", ".join(pending))
        if not incorrect and not pending:
            results.report("PASS", group, "datos declarados válidos; comprobación real separada")
    if invalid:
        return False
    net, access = doc["network"], doc["access"]
    if net["vpc_cidr"] and net["subnet_cidr"] and not ipaddress.ip_network(net["subnet_cidr"]).subnet_of(ipaddress.ip_network(net["vpc_cidr"])):
        results.report("FAIL", "Subred", "CIDR fuera de la VPC")
        return False
    if access["method"] == "ssm" and (net["lab_ingress"] or access["ssh_admin_cidr"] is not None):
        results.report("FAIL", "Acceso SSM", "laboratorio SSM requiere ingress vacío y CIDR SSH nulo")
        return False
    if access["method"] == "ssh" and net["lab_ingress"] is not None and access["ssh_admin_cidr"]:
        if {rule["source"] for rule in net["lab_ingress"]} != {access["ssh_admin_cidr"]}:
            results.report("FAIL", "Acceso SSH", "ingress difiere del CIDR administrativo")
            return False
    return True


def command(args: list[str], timeout: int = 5) -> str | None:
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def inspect_host(ec2: dict, results: Results) -> bool:
    system = platform.system()
    if system != "Linux":
        results.report("BLOCKED", "Host", f"{system}; el diagnóstico de servidor requiere Linux")
        return False
    arch = ARCH.get(platform.machine().lower())
    results.check(bool(arch) and (ec2["architecture"] is None or arch == ec2["architecture"]),
                  "Arquitectura nativa", arch or "no compatible")
    try:
        os_release = platform.freedesktop_os_release()
    except OSError:
        os_release = {}
    os_id, version = os_release.get("ID"), os_release.get("VERSION_ID")
    results.check(bool(os_id and version and (ec2["os_id"] is None or os_id == ec2["os_id"])
                      and (ec2["os_version"] is None or version == ec2["os_version"])), "Distribución", f"{os_id} {version}")
    total_cpu = os.cpu_count() or 0
    results.check(total_cpu > 0 and (ec2["vcpus"] is None or total_cpu == ec2["vcpus"]), "CPU", f"{total_cpu} lógicas")
    # La RAM utilizable reportada por Linux puede ser menor a la capacidad de EC2.
    try:
        memory = re.search(r"^MemTotal:\s+(\d+)", Path("/proc/meminfo").read_text(), re.M)
    except OSError:
        memory = None
    if memory:
        results.report("PASS", "RAM observada", f"{int(memory[1]) // 1024} MiB visibles a Linux; capacidad nominal pendiente de API")
    else:
        results.report("BLOCKED", "RAM", "sin MemTotal en /proc")
    storage = Path("/var/lib/buenvecino")
    inspect_disk(storage if storage.is_dir() else Path("/"), ec2["min_available_disk_gib"], "Disco de aplicación", results)
    for tool in ("bash", "systemctl", "systemd-analyze", "pg_dump", "pg_restore", "psql", "openssl", "flock"):
        results.report("PASS" if shutil.which(tool) else "BLOCKED", tool)
    results.report("PASS", "Python", platform.python_version())
    aws_version = command(["aws", "--version"])
    results.report("PASS" if aws_version and aws_version.startswith("aws-cli/2.") else "BLOCKED", "AWS CLI v2")
    sync = command(["timedatectl", "show", "-p", "NTPSynchronized", "--value"])
    results.report("PASS" if sync == "yes" else "FAIL" if sync == "no" else "BLOCKED", "Sincronización UTC")
    inspect_docker(arch, ec2["min_available_disk_gib"], results)
    inspect_ports(results)
    for name in PATHS:
        path = Path(name)
        if not path.is_dir():
            results.report("BLOCKED", name, "directorio pendiente")
        else:
            mode = stat.S_IMODE(path.stat().st_mode)
            results.check(not path.is_symlink() and not (mode & (0o077 if name.endswith("/backup") else 0o022)),
                          name, f"modo {mode:04o}")
    return True


def inspect_disk(path: Path, minimum: int | None, name: str, results: Results) -> None:
    try:
        free_gib = shutil.disk_usage(path).free / (1024 ** 3)
    except OSError:
        results.report("BLOCKED", name, "filesystem no accesible en este host")
        return
    fs = command(["findmnt", "-n", "-o", "FSTYPE", "-T", str(path)])
    results.check(minimum is None or free_gib >= minimum, name,
                  f"{free_gib:.2f} GiB disponibles; filesystem {fs or 'sin dato'}")


def inspect_docker(arch: str | None, minimum: int | None, results: Results) -> None:
    if not shutil.which("docker"):
        results.report("BLOCKED", "Docker Engine y Compose", "CLI no instalada")
        return
    compose = command(["docker", "compose", "version", "--short"])
    results.report("PASS" if compose and re.match(r"^v?(2|[3-9]|[1-9][0-9]+)\.", compose) else "BLOCKED", "Docker Compose")
    context_endpoint = command(["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
    # DOCKER_CONTEXT tiene prioridad sobre DOCKER_HOST cuando está configurado.
    endpoint = context_endpoint if os.environ.get("DOCKER_CONTEXT") else (os.environ.get("DOCKER_HOST") or context_endpoint)
    if not endpoint or not endpoint.startswith("unix://"):
        results.report("BLOCKED", "Docker Engine", "solo se consulta un socket Unix local")
        return
    server = command(["docker", "version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"])
    results.check(server == f"linux/{arch}", "Docker Engine local", "Engine accesible y plataforma coincidente" if server else "sin acceso")
    if server:
        directory = command(["docker", "info", "--format", "{{.DockerRootDir}}"])
        if directory and Path(directory).is_absolute():
            inspect_disk(Path(directory), minimum, "Disco de Docker", results)
        else:
            results.report("BLOCKED", "Disco de Docker", "sin DockerRootDir local verificable")


def inspect_ports(results: Results) -> None:
    output = command(["ss", "-H", "-ltn"])
    if output is None:
        results.report("BLOCKED", "Puertos", "requiere ss de iproute2")
        return
    endpoints = [row.split()[3].rpartition(":")[::2] for row in output.splitlines() if len(row.split()) >= 5]
    def safe(address: str) -> bool:
        try:
            return ipaddress.ip_address(address.strip("[]").split("%")[0]).is_loopback
        except ValueError:
            return False
    for port in (80, 443, 3000, 8000, 8080, 9090, 9100):
        addresses = [address for address, bound in endpoints if bound == str(port)]
        if not addresses:
            results.report("PASS", f"TCP {port}", "sin listener")
        elif any(not safe(address) for address in addresses):
            results.report("FAIL", f"TCP {port}", "listener fuera de loopback en preflight de laboratorio")
        else:
            results.report("BLOCKED", f"TCP {port}", "ocupado en loopback")


def imds_request(method: str, path: str, headers: dict[str, str]) -> bytes:
    connection = http.client.HTTPConnection("169.254.169.254", timeout=2)
    try:
        connection.request(method, path, headers=headers)
        response = connection.getresponse()
        if response.status != 200:
            raise OSError("IMDS no disponible")
        return response.read(8192)
    finally:
        connection.close()


def check_identity(doc: dict, results: Results) -> None:
    ec2 = doc["ec2"]
    profile = doc["access"]["instance_profile_arn"]
    if not profile or not doc["aws"]["region"] or not all(ec2[key] for key in ("instance_id", "instance_type", "ami_id", "architecture")):
        results.report("BLOCKED", "IMDSv2", "faltan región, identidad o perfil en el contrato")
        return
    try:
        token = imds_request("PUT", "/latest/api/token", {"X-aws-ec2-metadata-token-ttl-seconds": "60"}).decode()
        headers = {"X-aws-ec2-metadata-token": token}
        identity = json.loads(imds_request("GET", "/latest/dynamic/instance-identity/document", headers))
        info = json.loads(imds_request("GET", "/latest/meta-data/iam/info", headers))
        results.check(identity["instanceId"] == ec2["instance_id"] and identity["instanceType"] == ec2["instance_type"]
                      and identity["imageId"] == ec2["ami_id"] and identity["region"] == doc["aws"]["region"]
                      and ARCH.get(identity["architecture"]) == ec2["architecture"], "Identidad IMDSv2")
        results.check(info["InstanceProfileArn"] == profile, "Instance Profile adjunto")
    except (OSError, ValueError, KeyError, http.client.HTTPException):
        results.report("BLOCKED", "IMDSv2", "sin documento/metadatos de perfil; revisar opción IMDS y host")


def check_supabase(doc: dict, ca_file: Path | None, results: Results) -> None:
    host, port = doc["supabase"]["host"], doc["supabase"]["port"]
    if not (host and port and doc["supabase"]["mode"] and shutil.which("openssl") and shutil.which("getent")):
        results.report("BLOCKED", "DNS/TLS Supabase", "faltan datos aprobados, OpenSSL o getent")
        return
    if ca_file is not None and not ca_file.is_file():
        results.report("BLOCKED", "TLS Supabase", "CA autorizada no legible")
        return
    for family in (4, 6):
        visible = command(["getent", f"ahostsv{family}", host])
        addresses = [ipaddress.ip_address(row.split()[0]) for row in (visible or "").splitlines() if row]
        available = any(address.version == family and not getattr(address, "ipv4_mapped", None) for address in addresses)
        results.report("PASS" if available else "NOT RUN", f"DNS IPv{family} Supabase",
                       "resolución del host disponible" if available else "sin resultado utilizable desde el host")
    args = ["openssl", "s_client", "-starttls", "postgres", "-connect", f"{host}:{port}",
            "-servername", host, "-verify_hostname", host, "-verify_return_error", "-brief"]
    if ca_file is not None:
        args.extend(["-CAfile", str(ca_file)])
    started = time.monotonic()
    try:
        response = subprocess.run(args, input="", capture_output=True, text=True, timeout=12, check=False)
        verified = response.returncode == 0 and "Verification: OK" in (response.stderr + response.stdout)
    except (OSError, subprocess.TimeoutExpired, socket.timeout):
        verified = False
    results.check(verified, "TCP/TLS PostgreSQL sin autenticación", f"{(time.monotonic() - started) * 1000:.0f} ms del sondeo")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, default=EXAMPLE)
    parser.add_argument("--contract-only", action="store_true")
    parser.add_argument("--identity", action="store_true", help="Consultar identidad y perfil IMDSv2 desde una EC2 autorizada.")
    parser.add_argument("--supabase-tls", action="store_true", help="Sondear DNS y TLS al endpoint aprobado sin autenticar.")
    parser.add_argument("--pg-ca-file", type=Path)
    args = parser.parse_args()
    if (args.contract_only and (args.identity or args.supabase_tls)) or (args.pg_ca_file and not args.supabase_tls):
        parser.error("opciones incompatibles")
    results = Results()
    try:
        doc = json.loads(args.contract.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        results.report("FAIL", "Contrato", "archivo ausente o JSON inválido")
        return 1
    if not validate_contract(doc, results):
        return 1
    linux = not args.contract_only and inspect_host(doc["ec2"], results)
    if args.identity and linux:
        check_identity(doc, results)
    elif args.identity:
        results.report("BLOCKED", "Identidad y perfil IMDSv2", "requiere un host Linux EC2 autorizado")
    else:
        results.report("NOT RUN", "Identidad y perfil IMDSv2", "requiere --identity en una EC2 autorizada")
    if args.supabase_tls and linux:
        check_supabase(doc, args.pg_ca_file, results)
    elif args.supabase_tls:
        results.report("BLOCKED", "DNS/TLS Supabase", "requiere un host Linux EC2 autorizado")
    else:
        results.report("NOT RUN", "DNS/TLS Supabase", "requiere --supabase-tls y destino aprobado")
    return results.exit_code()


if __name__ == "__main__":
    raise SystemExit(main())
