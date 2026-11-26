#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=deploy/scripts/backup-lib.sh
source "$SCRIPT_DIR/backup-lib.sh"

case "${1:---check}" in
    --help) printf '%s\n' 'Uso: setup.sh [--check|--prepare]'; exit 0 ;;
    --check) (( $# <= 1 )) || fail 2 'Demasiados argumentos.' ;;
    --prepare) fail 3 'La preparación del host requiere aprobación. Consulte INIT-005 para los comandos de Ubuntu.' ;;
    *) fail 2 'Argumento desconocido.' ;;
esac

ok=true
check() {
    local label=$1; shift
    if "$@" >/dev/null 2>&1; then
        printf '%s: PASS\n' "$label"
    else
        printf '%s: BLOCKED\n' "$label"
        ok=false
    fi
}

os=$(uname -s)
architecture=$(uname -m)
printf 'Sistema=%s arquitectura=%s Bash=%s\n' "$os" "$architecture" "$BASH_VERSION"
check Linux test "$os" = Linux
check Arquitectura grep -Eq '^(x86_64|aarch64)$' <<< "$architecture"
for tool in bash docker aws psql pg_dump pg_restore python3 flock sha256sum timeout openssl base64; do
    check "$tool" command -v "$tool"
done
check 'Docker Engine' docker info --format '{{.ServerVersion}}'
check 'Docker Compose' docker compose version
check 'AWS CLI v2' bash -c 'aws --version 2>&1 | grep -q "^aws-cli/2\."'
if command -v pg_dump >/dev/null; then pg_dump --version; fi
check 'BACKUP_WORK_DIR (privado, escribible)' private_path "${BACKUP_WORK_DIR:-/dev/null}"
check 'BACKUP_WORK_DIR (acceso)' test -w "${BACKUP_WORK_DIR:-/dev/null}"
check 'MONITORING_TEXTFILE_DIR (escribible)' test -d "${MONITORING_TEXTFILE_DIR:-/dev/null}" -a -w "${MONITORING_TEXTFILE_DIR:-/dev/null}"
check 'PGSERVICEFILE (protegido)' private_path "${PGSERVICEFILE:-/dev/null}"
check 'PGPASSFILE (protegido)' private_path "${PGPASSFILE:-/dev/null}"
check BACKUP_PG_SERVICE test -n "${BACKUP_PG_SERVICE:-}"
check AWS_REGION test -n "${AWS_REGION:-}"
check AWS_S3_BACKUP_BUCKET test -n "${AWS_S3_BACKUP_BUCKET:-}"
check 'Zona America/Lima disponible' test -r /usr/share/zoneinfo/America/Lima
work=${BACKUP_WORK_DIR:-$SCRIPT_DIR}
if [[ -d $work ]]; then
    # Reporta capacidad sin nombres del host. El espacio requerido depende del dump.
    df -Pk -- "$work" | awk 'NR == 2 {printf "Espacio disponible en KiB=%s\n", $4; if ($4 < 1) exit 1}' ||
        ok=false
fi
[[ $ok == true ]] || fail 3 'Preflight incompleto. No se modificó el host.'
