#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=deploy/scripts/backup-lib.sh
source "$SCRIPT_DIR/backup-lib.sh"

usage() { printf '%s\n' 'Uso: backup.sh --storage fixture|s3 [--weekly]'; }
storage=
weekly=false
while (( $# )); do
    case "$1" in
        --help) usage; exit 0 ;;
        --storage)
            [[ $# -ge 2 && -z $storage ]] || fail 2 'Indique un modo de almacenamiento.'
            storage=$2
            shift
            ;;
        --weekly) weekly=true ;;
        *) usage >&2; fail 2 'Argumento desconocido.' ;;
    esac
    shift
done

init_storage "$storage"
require_tools pg_dump pg_restore psql grep
[[ -n ${MONITORING_TEXTFILE_DIR:-} && -d $MONITORING_TEXTFILE_DIR && -w $MONITORING_TEXTFILE_DIR &&
   ! -L $MONITORING_TEXTFILE_DIR ]] || fail 3 'Configure un directorio textfile existente y escribible.'
zone=${BACKUP_TIMEZONE:-America/Lima}
[[ $zone == America/Lima && -f /usr/share/zoneinfo/America/Lima ]] ||
    fail 2 'Se requiere la zona horaria America/Lima.'
unset PGPASSWORD PGSERVICE PGHOSTADDR PGOPTIONS
if [[ $storage == fixture ]]; then
    [[ -f $MONITORING_TEXTFILE_DIR/.buenvecino-init005-fixture ]] ||
        fail 3 'El directorio textfile fixture debe estar marcado y ser exclusivo de INIT-005.'
    dsn='host=/var/run/postgresql port=5432 dbname=buenvecino_init005_source user=postgres connect_timeout=5'
    marker=$(timeout 10 psql -XAtw --dbname="$dsn" -c "
        SELECT shobj_description(oid,'pg_database') FROM pg_database
        WHERE datname=current_database() AND inet_server_addr() IS NULL;" 2>/dev/null) ||
        fail 4 'No se pudo comprobar PostgreSQL de laboratorio.'
    [[ $marker == buenvecino-init005:source ]] || fail 3 'El origen no está autorizado como fixture.'
else
    [[ ${BACKUP_PG_SERVICE:-} =~ ^[A-Za-z0-9_.-]+$ ]] || fail 2 'Configure BACKUP_PG_SERVICE.'
    [[ -n ${PGSERVICEFILE:-} && -f $PGSERVICEFILE && -r $PGSERVICEFILE &&
       -n ${PGPASSFILE:-} && -f $PGPASSFILE && -r $PGPASSFILE ]] ||
        fail 3 'Se requieren PGSERVICEFILE y PGPASSFILE legibles y protegidos.'
    if ! private_path "$PGSERVICEFILE" || ! private_path "$PGPASSFILE"; then
        fail 3 'Los archivos libpq deben ser privados y propios.'
    fi
    dsn="service=$BACKUP_PG_SERVICE sslmode=verify-full connect_timeout=8"
    export PGSERVICEFILE PGPASSFILE
    tls=$(timeout 15 psql -XAtw --dbname="$dsn" -c "
        SELECT ssl AND inet_server_addr() IS NOT NULL
        FROM pg_stat_ssl WHERE pid=pg_backend_pid();" 2>/dev/null) ||
        fail 4 'No se pudo conectar a PostgreSQL con TLS.'
    [[ $tls == t ]] || fail 3 'El servicio PostgreSQL del respaldo remoto requiere TCP con TLS.'
fi

exec 9>"$BACKUP_WORK_DIR/backup.lock"
flock -n 9 || fail 3 'Ya se está ejecutando un respaldo.'
scratch=$(mktemp -d -- "$BACKUP_WORK_DIR/backup.XXXXXXXX") || fail 4 'No se pudo reservar un directorio temporal.'
metric_tmp=
cleanup() {
    [[ -z $metric_tmp ]] || rm -f -- "$metric_tmp"
    rm -f -- "$scratch/backup.dump" "$scratch/toc" "$scratch/received.dump" "$scratch/week"
    rmdir -- "$scratch"
}
trap cleanup EXIT
trap 'exit 4' HUP INT TERM
trap 'fail 4 "Fallo de respaldo. La última muestra válida permanece intacta."' ERR

file=$scratch/backup.dump
captured_epoch=$(date -u +%s)
captured=$(date -u -d "@$captured_epoch" +%FT%TZ)
stamp=$(date -u -d "@$captured_epoch" +%Y%m%dT%H%M%SZ)
day=$(TZ=$zone date -d "@$captured_epoch" +%F)
week=$(TZ=$zone date -d "@$captured_epoch" +%G-W%V)
id=$stamp-${scratch##*.}

start=$(milliseconds)
timeout 900 pg_dump --no-password --format=custom --schema=public --no-owner --no-privileges \
    --lock-wait-timeout=10s --file="$file" --dbname="$dsn" >/dev/null 2>&1 ||
    fail 4 'Falló la exportación PostgreSQL.'
log "exportacion_ms=$(( $(milliseconds) - start ))"
start=$(milliseconds)
validate_archive "$file" "$scratch/toc" || fail 4 'Dump vacío, inválido o sin objetos esenciales.'
size=$(archive_size "$file")
sha=$(archive_hash "$file")
log "validacion_ms=$(( $(milliseconds) - start )) bytes=$size sha256=$sha captura_utc=$captured"

keys=("backups/daily/$day/$id.dump")
week_state=$BACKUP_WORK_DIR/last-verified-week
last_week=
if [[ -f $week_state ]]; then
    read -r last_week < "$week_state"
fi
write_week=false
if [[ $last_week != "$week" || $weekly == true ]]; then
    keys+=("backups/weekly/$week/$id.dump")
    write_week=true
fi
for key in "${keys[@]}"; do
    version=$(object_put "$storage" "$key" "$file" "$size" "$sha" "$captured") ||
        fail 4 'Falló la transferencia del respaldo.'
    verify_transfer "$storage" "$key" "$version" "$file" "$scratch/received.dump" ||
        fail 4 'Falló la verificación del respaldo transferido.'
    log "objeto_verificado almacenamiento=$storage clave=$key version=$object_version"
done
if [[ $write_week == true ]]; then
    printf '%s\n' "$week" > "$scratch/week"
    mv -fT -- "$scratch/week" "$week_state"
fi

completed=$(date -u +%s)
metric_tmp=$(mktemp -- "$MONITORING_TEXTFILE_DIR/.backup.XXXXXXXX")
printf '# TYPE backup_last_success_timestamp gauge\nbackup_last_success_timestamp %s\n# TYPE backup_last_size_bytes gauge\nbackup_last_size_bytes %s\n' \
    "$completed" "$size" > "$metric_tmp"
chmod 0644 -- "$metric_tmp"
mv -fT -- "$metric_tmp" "$MONITORING_TEXTFILE_DIR/backup.prom"
metric_tmp=
if [[ $storage == fixture ]]; then
    log 'Respaldo integral de laboratorio verificado en almacenamiento simulado.'
else
    log 'Respaldo integral verificado en S3.'
fi
