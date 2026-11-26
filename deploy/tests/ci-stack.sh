#!/usr/bin/env bash
# Validaciones reproducibles. Los datos, puertos y objetos Docker son de laboratorio.
set -Eeuo pipefail
umask 077
export MSYS_NO_PATHCONV=1
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
pg_image=postgres@sha256:073e7c8b84e2197f94c8083634640ab37105effe1bc853ca4d5fbece3219b0e8
prom_image=prom/prometheus:v2.54.1
caddy_image=caddy:2-alpine

native_path() {
    if command -v cygpath >/dev/null; then cygpath -am "$1"; else printf '%s' "$1"; fi
}
python=python3
command -v "$python" >/dev/null || python=python
checks() { "$python" "$(native_path "$root/deploy/tests/ci_checks.py")" "$@"; }
[[ $# == 3 && $3 =~ ^buenvecino-(init006|ci-[a-z0-9-]+)$ && -d $2 ]] || {
    echo 'Uso: ci-stack.sh static|postgres|smoke DIRECTORIO buenvecino-init006' >&2
    exit 2
}
work=$(cd -- "$2" && pwd -P)
project=$3
work=$(mktemp -d "$work/$1.XXXXXXXX")

static_checks() {
    checks static
    checks observability
    local file
    for file in "$root"/deploy/scripts/*.sh "$root"/deploy/tests/*.sh; do bash -n "$file"; done
    sed 's/__MONITORING_ENVIRONMENT__/laboratorio/g' "$root/monitoring/prometheus/prometheus.yml" > "$work/prometheus-effective.yml"
    "$python" "$(native_path "$root/monitoring/prometheus/tests/alert-expressions.py")" "$(native_path "$work/alert-cases.yml")"
    local -a prom=(docker run --rm --network none
        --mount "type=bind,source=$(native_path "$work"),target=/checks,readonly"
        --entrypoint /bin/promtool "$prom_image")
    "${prom[@]}" check config /checks/prometheus-effective.yml
    "${prom[@]}" test rules /checks/alert-cases.yml

    local -a caddy=(docker run --rm --network none
        --mount "type=bind,source=$(native_path "$root/deploy"),target=/etc/caddy,readonly")
    "${caddy[@]}" "$caddy_image" caddy validate --config /etc/caddy/Caddyfile.dev --adapter caddyfile
    "${caddy[@]}" -e SITE_ADDRESS=ci.example.org -e ACME_EMAIL=ci@example.org -e ACME_CA=staging \
        --entrypoint /bin/sh "$caddy_image" /etc/caddy/scripts/caddy-production.sh validate
    local rc=0
    "${caddy[@]}" -e SITE_ADDRESS=localhost --entrypoint /bin/sh "$caddy_image" \
        /etc/caddy/scripts/caddy-production.sh validate >/dev/null 2>&1 || rc=$?
    [[ $rc == 78 ]]
    echo 'PASS Caddy dev, HTTPS de sintaxis y preflight inválido 78'
    if command -v systemd-analyze >/dev/null; then
        LC_ALL=C systemd-analyze verify "$root"/deploy/systemd/*.service "$root"/deploy/systemd/*.timer
        LC_ALL=C systemd-analyze calendar '*-*-* 03:00:00 America/Lima'
        grep -Fxq 'OnCalendar=*-*-* 03:00:00 America/Lima' "$root/deploy/systemd/buenvecino-backup.timer"
        grep -Fxq 'OnUnitActiveSec=15s' "$root/deploy/systemd/buenvecino-healthcheck.timer"
        echo 'PASS systemd y calendario'
    else
        echo 'WARN systemd-analyze no está disponible en el host'
    fi
}

postgres_checks() {
    postgres_container=$project-postgres-ci
    mkdir "$work/textfile"
    touch "$work/textfile/.buenvecino-init005-fixture"
    # Permiso acotado al bind temporal y a este contenedor sin interfaces externas.
    chmod 1777 "$work/textfile"
    docker run -d --name "$postgres_container" --network none --tmpfs /var/lib/postgresql --tmpfs /lab:mode=1777 \
        --mount "type=bind,source=$(native_path "$root"),target=/repo,readonly" \
        --mount "type=bind,source=$(native_path "$work/textfile"),target=/collector" \
        -e POSTGRES_HOST_AUTH_METHOD=trust "$pg_image" >/dev/null
    trap 'docker rm -f "$postgres_container" >/dev/null' EXIT
    docker exec "$postgres_container" bash -ec 'touch /lab/.buenvecino-init005;
        timeout 60 bash -c "until gosu postgres pg_isready -q -h /var/run/postgresql -d postgres; do sleep 1; done"'
    docker exec -u postgres "$postgres_container" bash /repo/deploy/tests/continuity.sh
    local -a psql=(docker exec -i -u postgres "$postgres_container" psql -X -v ON_ERROR_STOP=1 -d buenvecino_init005_source)
    "${psql[@]}" -f /repo/db/tests/rls_tests.sql
    "${psql[@]}" <<'SQL'
DO $$
BEGIN
    ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='public') > 0;
    BEGIN
        UPDATE public.productos SET stock_actual=-1;
        RAISE EXCEPTION 'El CHECK de stock aceptó un valor negativo';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    BEGIN
        UPDATE public.detalle_ventas SET producto_id=-1;
        RAISE EXCEPTION 'La FK aceptó un producto inexistente';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
END $$;
SQL
    echo 'PASS RLS habilitado, políticas presentes, CHECK y FK'
}

compose() { docker compose "${lab_args[@]}" "$@"; }

expect_http() {
    local expected=$1 route=$2
    local actual
    actual=$(curl --noproxy '*' --silent --show-error --max-time 12 --output "$(native_path "$work/http-response")" \
        --write-out '%{http_code}' "http://localhost:8080$route")
    [[ $actual == "$expected" ]] || { echo "FAIL $route HTTP $actual" >&2; return 1; }
    echo "PASS $route HTTP $actual"
}

smoke_checks() {
    [[ -n ${CI_BACKEND_IMAGE:-} && -n ${CI_FRONTEND_IMAGE:-} ]]
    [[ -z $(docker ps -aq --filter "label=com.docker.compose.project=$project") ]] || {
        echo 'El nombre Compose ya está en uso. Seleccione un proyecto CI nuevo.' >&2
        return 1
    }
    unset COMPOSE_PROFILES COMPOSE_ENV_FILES
    export ENVIRONMENT=development
    export CI_GRAFANA_PASSWORD
    CI_GRAFANA_PASSWORD=$("$python" -c 'import secrets; print(secrets.token_hex(24))')
    mkdir "$work/textfile"
    if [[ ${GITHUB_ACTIONS:-} == true ]]; then printf '::add-mask::%s\n' "$CI_GRAFANA_PASSWORD"; fi
    cat > "$work/lab.env" <<ENV
SECRET_KEY=ci-fixture-local-jwt
DATABASE_URL=
BACKEND_IMAGE=$CI_BACKEND_IMAGE
FRONTEND_IMAGE=$CI_FRONTEND_IMAGE
MONITORING_TEXTFILE_DIR=$(native_path "$work/textfile")
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$CI_GRAFANA_PASSWORD
ENV
    local -a base=(--env-file "$(native_path "$work/lab.env")" -p "$project"
        -f "$(native_path "$root/deploy/docker-compose.yml")")
    lab_args=("${base[@]}" -f "$(native_path "$root/deploy/docker-compose.dev.yml")")
    docker compose "${base[@]}" config --quiet
    compose config --quiet
    docker compose "${base[@]}" config --format json | checks compose base
    compose config --format json | checks compose dev
    docker run --rm --network none --entrypoint nginx "$CI_FRONTEND_IMAGE" -t
    local rc=0
    docker run --rm --network none -e ENVIRONMENT=production "$CI_BACKEND_IMAGE" || rc=$?
    [[ $rc == 78 ]]
    echo 'PASS bloqueo productivo backend 78'
    trap 'compose stop --timeout 20 >/dev/null' EXIT
    compose up -d --no-build --wait --wait-timeout 150
    compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Ports}}'
    expect_http 200 /
    expect_http 200 /inventario
    expect_http 200 /health
    expect_http 401 /api/v1/productos
    expect_http 404 /metrics
    expect_http 404 /uploads/fixture
    compose exec -T prometheus promtool check config /tmp/prometheus-effective.yml
    checks observe "$project" "$(native_path "$work/sample-time")"
    # Esperar al menos un scrape para que la muestra histórica se distinga del reinicio.
    sleep 16
    compose restart prometheus
    checks observe "$project" "$(native_path "$work/sample-time")" --verify-history
    if [[ ${CI_RUN_E2E:-0} == 1 ]]; then
        node "$(native_path "$root/frontend/tests-e2e/run-ci.mjs")"
    else
        echo 'NOT RUN Navegador (use CI_RUN_E2E=1)'
    fi
}

case "$1" in
    static) static_checks ;;
    postgres) postgres_checks ;;
    smoke) smoke_checks ;;
    *) exit 2 ;;
esac
