# shellcheck shell=bash
# Contrato común para operar exclusivamente proyectos locales del minimarket.

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
fail() { local code=$1; shift; log "$*"; exit "$code"; }
root=$(cd -- "$SCRIPT_DIR/../.." && pwd -P)
base=$root/deploy/docker-compose.yml
override=$root/deploy/docker-compose.dev.yml
project='' env_file='' mode='' build=false

usage() {
    printf 'Uso: %s --project buenvecino-ID --env-file ARCHIVO --mode local %s\n' "${0##*/}" "$1"
}

parse_options() {
    local command=$1; shift
    while (( $# )); do
        case "$1" in
            --project|--env-file|--mode) (( $# >= 2 )) || fail 2 'Falta el valor de un argumento.' ;;
            --build) [[ $command == start ]] || fail 2 'Opción --build inválida.' ;;
            --textfile-dir) [[ $command == healthcheck && $# -ge 2 ]] || fail 2 'Indique --textfile-dir.' ;;
            --require-ready) [[ $command == healthcheck ]] || fail 2 'Opción --require-ready inválida.' ;;
            --help) usage "$options"; exit 0 ;;
            *) usage "$options" >&2; fail 2 'Argumento desconocido.' ;;
        esac
        case "$1" in
            --project) project=$2; shift ;;
            --env-file) env_file=$2; shift ;;
            --mode) mode=$2; shift ;;
            --build) build=true ;;
            --textfile-dir) textfile=$2; shift ;;
            --require-ready) require_ready=true ;;
        esac
        shift
    done
    [[ $mode != production ]] || fail 3 'El modo productivo está bloqueado hasta cerrar INIT-001.'
    [[ $mode == local && $project =~ ^buenvecino-[a-z0-9][a-z0-9_-]{0,39}$ && -f $env_file && -r $env_file ]] ||
        fail 2 'Indique modo local, nombre de proyecto explícito y archivo de laboratorio legible.'
    case "$project" in
        buenvecino-init002|buenvecino-init003|buenvecino-init004)
            fail 3 'Los laboratorios anteriores se preservan.' ;;
    esac
    unset COMPOSE_PROFILES COMPOSE_ENV_FILES
    export ENVIRONMENT=development
    compose_args=(--env-file "$env_file" --project-name "$project" -f "$base" -f "$override")
}

compose() { docker compose "${compose_args[@]}" "$@"; }

check_engine() {
    local endpoint
    command -v docker >/dev/null || fail 3 'Docker CLI no está disponible.'
    endpoint=${DOCKER_HOST:-}
    if [[ -z $endpoint ]]; then
        endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null) ||
            fail 3 'No se pudo determinar el contexto Docker.'
    fi
    case "$endpoint" in unix://*|npipe://*) ;; *) fail 3 'Seleccione un Docker Engine local.' ;; esac
    docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || fail 3 'Docker Engine no responde.'
    docker compose version >/dev/null 2>&1 || fail 3 'Se requiere Docker Compose v2.'
}

check_project() {
    local expected_base=$base expected_override=$override labels label
    if command -v cygpath >/dev/null; then
        expected_base=$(cygpath -aw "$base")
        expected_override=$(cygpath -aw "$override")
    fi
    labels=$(docker ps -a --filter "label=com.docker.compose.project=$project" \
        --format '{{.Label "com.docker.compose.project.config_files"}}|' 2>/dev/null) ||
        fail 3 'No se pudieron inspeccionar los contenedores.'
    if [[ -z $labels ]]; then
        [[ $1 == new ]] || fail 3 'El proyecto seleccionado no tiene contenedores del minimarket.'
        return
    fi
    while IFS= read -r label; do
        [[ $label == "$expected_base,$expected_override|" ]] ||
            fail 3 'El proyecto contiene servicios ajenos al Compose local del minimarket.'
    done <<< "$labels"
}

show_status() { compose ps --all --format 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Ports}}'; }
