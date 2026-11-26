#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=deploy/scripts/compose-common.sh
source "$SCRIPT_DIR/compose-common.sh"

textfile=${MONITORING_TEXTFILE_DIR:-$root/monitoring/node-exporter/textfile}
require_ready=false
run_probe() {
    local url=$1 python=python3
    command -v "$python" >/dev/null || python=python
    command -v "$python" >/dev/null || fail 3 'Se requiere Python 3 para el sondeo.'
    [[ -d $textfile && -w $textfile ]] || fail 3 'El directorio textfile no existe o no permite escritura.'
    "$python" "$SCRIPT_DIR/probe-spa.py" --url "$url" --timeout 3 --textfile-dir "$textfile"
}
if [[ ${1:-} == --probe-only ]]; then
    shift
    [[ $# == 2 && $1 == --url ]] || fail 2 'Uso: healthcheck.sh --probe-only --url URL'
    run_probe "$2" || fail 4 'Sondeo funcional fallido.'
    exit 0
fi

options='[--textfile-dir DIR] [--require-ready]'
parse_options healthcheck "$@"
check_engine
check_project existing
printf '%s\n' 'Docker Engine: activo'
failed=false
for service in caddy frontend backend prometheus grafana node-exporter cadvisor; do
    id=$(compose ps -a -q "$service" 2>/dev/null) || fail 4 'Falló la consulta Compose.'
    state=
    if [[ -n $id ]]; then
        state=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}sin-healthcheck{{end}}' "$id" 2>/dev/null) ||
            fail 4 'Falló la consulta del estado Docker.'
    fi
    printf '%s: %s\n' "$service" "${state:-ausente}"
    [[ $state == 'running healthy' || $state == 'running sin-healthcheck' ]] || failed=true
done

check_http() {
    local label=$1; shift
    if "$@" >/dev/null 2>&1; then
        printf '%s: accesible\n' "$label"
    else
        printf '%s: fallo\n' "$label"
        failed=true
    fi
}
if run_probe http://localhost:8080/; then
    printf '%s\n' 'Caddy y SPA: funcionales'
else
    failed=true
fi
check_http 'Frontend HTTP interno' compose exec -T caddy wget -q -T 4 -O /dev/null http://frontend/

backend_status() {
    compose exec -T backend python -c '
import sys
from urllib.error import HTTPError
from urllib.request import urlopen
try:
    with urlopen("http://127.0.0.1:8000/" + sys.argv[1], timeout=4) as r:
        print(r.status)
except HTTPError as error:
    print(error.code)
' "$1" 2>/dev/null
}
live=$(backend_status health) || live=no-verificado
printf 'Backend liveness: %s\n' "$live"
[[ $live == 200 ]] || failed=true
ready=$(backend_status ready) || ready=no-verificado
case "$ready" in
    200) printf '%s\n' 'PostgreSQL: disponible según /ready interno' ;;
    404) printf '%s\n' 'PostgreSQL: BLOCKED, /ready aún no implementado' ;;
    503) printf '%s\n' 'PostgreSQL: no disponible según /ready'; failed=true ;;
    *) printf '%s\n' 'PostgreSQL: NO VERIFICADO'; failed=true ;;
esac
for endpoint in \
    'Prometheus http://127.0.0.1:9090/-/ready' 'Grafana http://grafana:3000/api/health' \
    'NodeExporter http://node-exporter:9100/metrics' 'cAdvisor http://cadvisor:8080/metrics'; do
    check_http "${endpoint%% *}" compose exec -T prometheus wget -q -T 4 -O /dev/null "${endpoint#* }"
done
[[ $failed == false ]] || fail 4 'Una o más comprobaciones fallaron.'
[[ $require_ready == false || $ready == 200 ]] || fail 3 'La disponibilidad PostgreSQL no se pudo acreditar.'
