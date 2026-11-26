#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=deploy/scripts/compose-common.sh
source "$SCRIPT_DIR/compose-common.sh"

options='[--build]'
parse_options start "$@"
check_engine
check_project new
compose config --quiet >/dev/null 2>&1 || fail 2 'Compose no acepta el archivo de entorno o la configuración.'
build_flag=--no-build
[[ $build == false ]] || build_flag=--build
compose up -d "$build_flag" --wait --wait-timeout 120 || fail 4 'Compose no pudo iniciar o esperar el proyecto local.'
show_status || fail 4 'No se pudo consultar el estado final.'
