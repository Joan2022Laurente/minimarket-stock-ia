#!/usr/bin/env python3
"""Sondeo HTTP del HTML de la SPA, con salida para Node Exporter."""

import argparse
import os
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl) -> None:
        return None


def probe(url: str, timeout: float) -> tuple[bool, int, float]:
    start = time.monotonic()
    status = 0
    success = False
    try:
        opener = build_opener(ProxyHandler({}), RejectRedirects())
        request = Request(url, headers={"Accept": "text/html"})
        with opener.open(request, timeout=timeout) as response:
            status = response.status
            if status == 200 and response.headers.get_content_type() == "text/html":
                html = response.read(262_144)
                success = b'id="root"' in html and b'/assets/' in html
    except HTTPError as error:
        status = error.code
        error.close()
    except (URLError, OSError):
        pass
    return success, status, time.monotonic() - start


def write_result(directory: Path, success: bool, status: int, duration: float) -> None:
    samples = (
        ("minimarket_probe_success", "Resultado del sondeo de la SPA", int(success)),
        ("minimarket_probe_duration_seconds", "Tiempo del ultimo sondeo de la SPA", f"{duration:.6f}"),
        ("minimarket_probe_timestamp_seconds", "Fin del ultimo sondeo de la SPA", int(time.time())),
        ("minimarket_probe_http_status_code", "Estado HTTP observado, 0 si no hubo respuesta", status),
    )
    with tempfile.NamedTemporaryFile(mode="w", encoding="ascii", dir=directory, suffix=".tmp", delete=False) as stream:
        temporary = Path(stream.name)
    try:
        with temporary.open("w", encoding="ascii", newline="\n") as stream:
            for name, description, value in samples:
                stream.write(f'# HELP {name} {description}\n# TYPE {name} gauge\n{name}{{check="spa"}} {value}\n')
        temporary.chmod(0o644)
        os.replace(temporary, directory / "probe-spa.prom")
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8080/")
    parser.add_argument("--textfile-dir", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=3)
    args = parser.parse_args()
    url = urlsplit(args.url)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username is not None or url.password is not None:
        parser.error("Se requiere una URL HTTP(S) sin credenciales")
    if not args.textfile_dir.is_dir() or not 0 < args.timeout <= 30:
        parser.error("Se requiere un directorio existente y timeout de 0 a 30 segundos")

    success, status, duration = probe(args.url, args.timeout)
    write_result(args.textfile_dir, success, status, duration)
    print(f"Sondeo SPA: estado={status} exito={int(success)} duracion_s={duration:.3f}")
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
