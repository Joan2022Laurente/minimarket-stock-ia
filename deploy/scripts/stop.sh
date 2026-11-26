#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=deploy/scripts/compose-common.sh
source "$SCRIPT_DIR/compose-common.sh"

options=
parse_options stop "$@"
check_engine
check_project existing
compose stop --timeout 20 || fail 4 'No se pudo detener el proyecto seleccionado.'
show_status || fail 4 'No se pudo consultar el estado final.'
