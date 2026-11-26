#!/usr/bin/env bash
# Ejecutar como postgres, dentro del contenedor aislado de INIT-005.
set -Eeuo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
source_db=buenvecino_init005_source
target_db=buenvecino_restore_init005
wrong_db=buenvecino_restore_unmarked
[[ -f /lab/.buenvecino-init005 && -f /collector/.buenvecino-init005-fixture ]] || {
    printf '%s\n' 'Se requiere el contenedor y el directorio textfile exclusivos del ensayo.' >&2
    exit 3
}
export BACKUP_WORK_DIR=/lab/work BACKUP_FIXTURE_DIR=/lab/fixture MONITORING_TEXTFILE_DIR=/collector
mkdir -m 700 -- "$BACKUP_WORK_DIR" "$BACKUP_FIXTURE_DIR"
faults=$(mktemp -d /tmp/init005-faults.XXXXXXXX)
cleanup() { rm -f -- "$faults/pg_dump" "$faults/aws"; rmdir -- "$faults"; }
trap cleanup EXIT
backup=(bash "$root/deploy/scripts/backup.sh")
restore=(bash "$root/deploy/scripts/restore.sh")
pg=(psql -X -w -v ON_ERROR_STOP=1 -h /var/run/postgresql -U postgres)

for file in "$root"/deploy/scripts/*.sh "$root"/deploy/tests/*.sh; do bash -n "$file"; done
printf '%s\n' 'PASS bash -n'
"${pg[@]}" -d postgres -c 'CREATE ROLE authenticated NOLOGIN;' >/dev/null
for db in "$source_db" "$target_db" "$wrong_db"; do
    createdb -h /var/run/postgresql -U postgres "$db"
    "${pg[@]}" -d "$db" <<'SQL' >/dev/null
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
SQL
done
"${pg[@]}" -d postgres <<'SQL' >/dev/null
COMMENT ON DATABASE buenvecino_init005_source IS 'buenvecino-init005:source';
COMMENT ON DATABASE buenvecino_restore_init005 IS 'buenvecino-init005:disposable';
SQL
for migration in "$root"/db/migrations/*.sql; do
    "${pg[@]}" -q -d "$source_db" -f "$migration" >/dev/null 2>&1
done
"${pg[@]}" -q -d "$source_db" <<'SQL' >/dev/null
INSERT INTO perfiles(id,nombre,email,rol)
VALUES ('00000000-0000-4000-8000-000000000005','Fixture INIT-005','fixture@example.invalid','cajero');
INSERT INTO categorias(nombre) VALUES ('Categoría fixture');
INSERT INTO proveedores(ruc,razon_social) VALUES ('00000000005','Proveedor fixture');
INSERT INTO productos(codigo_barras,nombre,categoria_id,proveedor_id,precio_costo,precio_venta,stock_actual)
VALUES ('INIT005-TEST','Producto fixture',1,1,2,5,10);
SELECT registrar_venta('INIT005-TICKET','00000000-0000-4000-8000-000000000005','Caja fixture',
                      'efectivo',20,'[{"producto_id":1,"cantidad":2}]');
INSERT INTO predicciones(producto_id,demanda_diaria_estimada,dias_cobertura,punto_reorden,cantidad_sugerida,nivel_alerta)
VALUES (1,2,4,3,5,'optimo');
SQL

expect() {
    local code=$1 label=$2 result=0
    shift 2
    "$@" >/lab/last-failure 2>&1 || result=$?
    if [[ $result != "$code" ]] || grep -qiE 'respaldo integral .*verificado|restauración de laboratorio verificada' /lab/last-failure; then
        printf 'FAIL %s salida=%s esperado=%s\n' "$label" "$result" "$code" >&2
        return 1
    fi
    printf 'PASS %s salida=%s\n' "$label" "$result"
}

cd /tmp
expect 2 argumentos "${backup[@]}" --storage
expect 2 destino-no-permitido "${restore[@]}" --key invalid --target-db postgres
"${backup[@]}" --storage fixture --weekly
metric=/collector/backup.prom
[[ $(stat -c '%a' "$metric") == 644 && -f $metric && ! -L $metric ]]
[[ -z $(find /collector -maxdepth 1 -name '.backup.*' -print) ]]
hash=$(sha256sum < "$metric")
cat -- "$metric"
key=$(find "$BACKUP_FIXTURE_DIR/backups/daily" -name '*.dump' -print -quit)
key=${key#"$BACKUP_FIXTURE_DIR/"}
[[ $(find "$BACKUP_FIXTURE_DIR/backups/weekly" -name '*.dump' | wc -l) == 1 ]]
archive=$BACKUP_FIXTURE_DIR/$key
read -r size checksum captured format encryption version remote_sum < "$archive.meta"
[[ $size == "$(stat -c '%s' "$archive")" && $(sha256sum < "$archive") == "$checksum  -" &&
   $version == "fixture-$checksum" && $format == pg-custom-v1 && $encryption == fixture &&
   $captured == *Z && $remote_sum == None ]]
printf '%s\n' 'PASS calendario diario/semanal y SHA-256 independiente'

restore_point=("${restore[@]}" --storage fixture --key "$key" --version "$version")
expect 3 destino-sin-marca "${restore_point[@]}" --target-db "$wrong_db" --confirm "$wrong_db"
expect 3 destino-sin-confirmacion "${restore_point[@]}" --target-db "$target_db" --confirm "$wrong_db"
expect 4 version-incorrecta "${restore[@]}" --storage fixture --key "$key" --version fixture-incorrecta \
    --target-db "$target_db" --confirm "$target_db"

cp -- "$archive.meta" /lab/original.meta
sed "s/$checksum/$(printf '%064d' 0)/1" /lab/original.meta > "$archive.meta"
expect 4 checksum-incorrecto "${restore_point[@]}" --target-db "$target_db" --confirm "$target_db"
mv -- /lab/original.meta "$archive.meta"
cp -- "$archive" /lab/original.dump
printf '%s\n' 'archivo alterado' > "$archive"
expect 4 archivo-remoto-corrupto "${restore_point[@]}" --target-db "$target_db" --confirm "$target_db"
mv -- /lab/original.dump "$archive"

"${restore_point[@]}" --target-db "$target_db" --confirm "$target_db"
expect 3 destino-con-objetos "${restore_point[@]}" --target-db "$target_db" --confirm "$target_db"
compare() {
    "${pg[@]}" -At -d "$1" <<'SQL'
SELECT 'perfiles='||count(*) FROM perfiles UNION ALL
SELECT 'categorias='||count(*) FROM categorias UNION ALL
SELECT 'proveedores='||count(*) FROM proveedores UNION ALL
SELECT 'productos='||count(*) FROM productos UNION ALL
SELECT 'ventas='||count(*) FROM ventas UNION ALL
SELECT 'detalle_ventas='||count(*) FROM detalle_ventas UNION ALL
SELECT 'movimientos_inventario='||count(*) FROM movimientos_inventario UNION ALL
SELECT 'predicciones='||count(*) FROM predicciones;
SELECT 'ticket_relacionado='||count(*)
FROM ventas v JOIN detalle_ventas d ON d.venta_id=v.id
JOIN productos p ON p.id=d.producto_id
JOIN movimientos_inventario m ON m.referencia_id=v.id AND m.producto_id=p.id
JOIN perfiles u ON u.id=v.usuario_id
WHERE v.numero_ticket='INIT005-TICKET' AND d.cantidad=2 AND v.total=10
  AND p.stock_actual=8 AND m.stock_posterior=8 AND m.cantidad=-2;
SELECT 'ventas_id_seq='||last_value||':'||is_called FROM public.ventas_id_seq;
SELECT 'funciones='||count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
AND proname IN ('registrar_venta','get_auth_user_role');
SQL
}
before=$(compare "$source_db")
after=$(compare "$target_db")
[[ $before == "$after" && $after == *'ticket_relacionado=1'* && $after == *'ventas_id_seq=1:true'* ]]
printf 'PASS conteos_origen_igual_destino\n%s\n' "$after"
functional=$("${pg[@]}" -At -d "$target_db" <<'SQL'
BEGIN;
SELECT 'venta_funcional='||((registrar_venta('INIT005-RESTORE-CHECK','00000000-0000-4000-8000-000000000005',
       'Caja fixture','tarjeta',NULL,'[{"producto_id":1,"cantidad":1}]')->>'venta_id')::integer > 1);
ROLLBACK;
SQL
)
grep -Fx 'venta_funcional=true' <<< "$functional"

# Un siguiente éxito en la misma semana actualiza el diario y reutiliza el
# punto semanal verificado, preservando todos los objetos previos.
"${backup[@]}" --storage fixture
[[ $(find "$BACKUP_FIXTURE_DIR/backups/daily" -name '*.dump' | wc -l) == 2 &&
   $(find "$BACKUP_FIXTURE_DIR/backups/weekly" -name '*.dump' | wc -l) == 1 ]]
hash=$(sha256sum < "$metric")
printf '%s\n' 'PASS siguiente respaldo diario conserva el semanal vigente'

expect 4 transferencia env BACKUP_FIXTURE_FAIL=transfer "${backup[@]}" --storage fixture
expect 4 verificacion-remota env BACKUP_FIXTURE_FAIL=verify "${backup[@]}" --storage fixture
(
    flock -n 9
    expect 3 concurrencia "${backup[@]}" --storage fixture
) 9>"$BACKUP_WORK_DIR/backup.lock"

cat > "$faults/pg_dump" <<'SH'
#!/usr/bin/env bash
for arg in "$@"; do
    if [[ $arg == --file=* ]]; then
        : > "${arg#*=}"
        if [[ ${TEST_DUMP:-empty} == corrupt ]]; then
            printf '%s\n' corrupto > "${arg#*=}"
        fi
    fi
done
SH
chmod 0700 "$faults/pg_dump"
expect 4 dump-vacio env PATH="$faults:$PATH" "${backup[@]}" --storage fixture
expect 4 dump-corrupto env PATH="$faults:$PATH" TEST_DUMP=corrupt "${backup[@]}" --storage fixture
if ! command -v aws >/dev/null; then
    expect 3 dependencia-aws-ausente "${backup[@]}" --storage s3
fi
cat > "$faults/aws" <<'SH'
#!/usr/bin/env bash
printf '%s\n' 'ERROR: el stub AWS nunca debe invocarse en esta prueba' >&2
touch /lab/aws-invocado
exit 99
SH
chmod 0700 "$faults/aws"
expect 3 credenciales-libpq-ausentes env -u PGSERVICEFILE -u PGPASSFILE PATH="$faults:$PATH" \
    AWS_REGION=us-east-1 AWS_S3_BACKUP_BUCKET=fixture-init005 BACKUP_PG_SERVICE=fixture "${backup[@]}" --storage s3
[[ ! -e /lab/aws-invocado && $(sha256sum < "$metric") == "$hash" ]]
[[ -z $(find "$BACKUP_WORK_DIR" -mindepth 1 -type d -print) &&
   -z $(find /collector -maxdepth 1 -name '.backup.*' -print) ]]
printf '%s\n' 'PASS timestamp, tamaño y archivo textfile idénticos después de fallos. Temporales limpios.'
