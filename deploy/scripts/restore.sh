#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=deploy/scripts/backup-lib.sh
source "$SCRIPT_DIR/backup-lib.sh"

usage() {
    printf '%s\n' 'Uso: restore.sh --storage fixture|s3 --key CLAVE [--version VERSION] --target-db buenvecino_restore_ID [--confirm NOMBRE_DB]'
}
storage='' key='' version='' target='' confirmation=''
while (( $# )); do
    case "$1" in
        --help) usage; exit 0 ;;
        --storage|--key|--version|--target-db|--confirm) (( $# >= 2 )) || fail 2 'Falta el valor de un argumento.' ;;
        *) usage >&2; fail 2 'Argumento desconocido.' ;;
    esac
    case "$1" in
        --storage) storage=$2 ;;
        --key) key=$2 ;;
        --version) version=$2 ;;
        --target-db) target=$2 ;;
        --confirm) confirmation=$2 ;;
    esac
    shift 2
done

valid_backup_key "$key" || fail 2 'Indique una clave válida de respaldo.'
[[ $target =~ ^buenvecino_restore_[a-z0-9_]{1,40}$ ]] || fail 2 'El nombre del destino no corresponde al laboratorio.'
[[ $version != *[[:cntrl:]]* && ${#version} -le 1024 ]] || fail 2 'Identificador de versión inválido.'
init_storage "$storage"
require_tools psql pg_restore grep sed
unset PGPASSWORD PGSERVICE PGHOSTADDR PGOPTIONS

# No se acepta un URI, un puerto o un host por argumento. Solo el socket del
# PostgreSQL desechable, con nombre y una marca independiente en su catálogo.
dsn="host=/var/run/postgresql port=5432 dbname=$target user=postgres connect_timeout=5"
target_query() { timeout 15 psql -XAtw -v ON_ERROR_STOP=1 --dbname="$dsn" "$@" 2>/dev/null; }
check_target() {
    local state
    state=$(target_query -c "
        SELECT (inet_server_addr() IS NULL
          AND shobj_description(oid,'pg_database') = 'buenvecino-init005:disposable'
          AND NOT EXISTS (SELECT FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())
          AND NOT EXISTS (SELECT FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','auth','information_schema'))
          AND NOT EXISTS (SELECT FROM pg_class WHERE relnamespace='public'::regnamespace)
          AND NOT EXISTS (SELECT FROM pg_proc WHERE pronamespace='public'::regnamespace)
          AND NOT EXISTS (SELECT FROM pg_type WHERE typnamespace='public'::regnamespace)
          AND to_regprocedure('auth.uid()') IS NOT NULL
          AND EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated')) IS TRUE
        FROM pg_database WHERE datname=current_database();") || return 1
    [[ $state == t ]]
}

exec 9>"$BACKUP_WORK_DIR/restore-$target.lock"
flock -n 9 || fail 3 'Ya hay una restauración para este destino.'
check_target || fail 3 'Destino sin autorización, sin prerrequisitos, ocupado o con objetos existentes.'
log "destino_laboratorio=$target via_socket"
if [[ -z $confirmation && -t 0 ]]; then
    read -r -p 'Escriba el nombre exacto de la base desechable para confirmar: ' confirmation || fail 3 'Confirmación no recibida.'
fi
[[ $confirmation == "$target" ]] || fail 3 'Se requiere confirmación explícita del destino.'

scratch=$(mktemp -d -- "$BACKUP_WORK_DIR/restore.XXXXXXXX") || fail 4 'No se pudo reservar un directorio temporal.'
cleanup() { rm -f -- "$scratch/backup.dump" "$scratch/toc" "$scratch/restore-toc"; rmdir -- "$scratch"; }
trap cleanup EXIT
trap 'exit 4' HUP INT TERM
trap 'fail 4 "Fallo de restauración."' ERR

start=$(milliseconds)
read_head "$storage" "$key" "$version" || fail 4 'No se encontró metadata válida de la versión solicitada.'
file=$scratch/backup.dump
object_download "$storage" "$key" "$object_version" "$file" || fail 4 'No se pudo descargar el respaldo.'
[[ $(archive_size "$file") == "$object_bytes" && $(archive_hash "$file") == "$object_sha" ]] ||
    fail 4 'El tamaño o el SHA-256 no coincide con la metadata.'
validate_archive "$file" "$scratch/toc" || fail 4 'El archivo recuperado no es un dump válido.'
# El destino desechable ya tiene el esquema public vacío de template1.
# Omitir solo su CREATE SCHEMA conserva las tablas, datos, políticas y funciones.
sed -E 's/^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public /; &/' "$scratch/toc" > "$scratch/restore-toc"
log "validacion_descarga_ms=$(( $(milliseconds) - start )) bytes=$object_bytes sha256=$object_sha captura_utc=$object_captured version=$object_version"

check_target || fail 3 'El destino dejó de cumplir las precondiciones.'
start=$(milliseconds)
timeout 900 pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --no-password \
    --use-list="$scratch/restore-toc" --dbname="$dsn" "$file" >/dev/null 2>&1 ||
    fail 4 'pg_restore falló. Revise el destino antes de reintentar.'
log "restauracion_ms=$(( $(milliseconds) - start ))"
start=$(milliseconds)
state=$(target_query -c "
    SELECT count(*) = 8 AND bool_and(relrowsecurity)
    AND to_regprocedure('public.registrar_venta(character varying,uuid,text,character varying,numeric,jsonb)') IS NOT NULL
    AND to_regprocedure('public.get_auth_user_role()') IS NOT NULL
    AND to_regclass('public.ventas_id_seq') IS NOT NULL
    FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'
      AND relname IN ('perfiles','categorias','proveedores','productos','ventas',
                      'detalle_ventas','movimientos_inventario','predicciones');") ||
    fail 4 'No se pudieron ejecutar las comprobaciones posteriores.'
[[ $state == t ]] || fail 4 'No coinciden los objetos esenciales restaurados.'
log "comprobaciones_ms=$(( $(milliseconds) - start )) Restauración de laboratorio verificada."
