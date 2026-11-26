# shellcheck shell=bash
# Funciones compartidas por backup.sh y restore.sh. El llamador activa modo estricto.

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
fail() { local code=$1; shift; log "$*"; exit "$code"; }
milliseconds() { date +%s%3N; }

require_tools() {
    local tool
    for tool in "$@"; do
        command -v "$tool" >/dev/null || fail 3 "Dependencia ausente: $tool"
    done
}

private_path() {
    [[ -O $1 && ! -L $1 && $(stat -c '%a' -- "$1") =~ ^[0-7]00$ ]]
}

init_storage() {
    local mode=$1
    require_tools flock timeout sha256sum stat mktemp
    case "$mode" in
        fixture)
            [[ -n ${BACKUP_FIXTURE_DIR:-} && -d $BACKUP_FIXTURE_DIR && -w $BACKUP_FIXTURE_DIR ]] ||
                fail 3 'BACKUP_FIXTURE_DIR debe ser un directorio de laboratorio existente y escribible.'
            private_path "$BACKUP_FIXTURE_DIR" || fail 3 'El directorio fixture debe ser privado y propio.'
            ;;
        s3)
            require_tools aws openssl base64
            [[ ${AWS_REGION:-} =~ ^[a-z]{2}(-[a-z0-9]+)+-[0-9]+$ &&
               ${AWS_S3_BACKUP_BUCKET:-} =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] ||
                fail 2 'Configure AWS_REGION y AWS_S3_BACKUP_BUCKET.'
            ;;
        *) fail 2 'Seleccione --storage fixture o --storage s3.' ;;
    esac
    [[ -n ${BACKUP_WORK_DIR:-} && -d $BACKUP_WORK_DIR && -w $BACKUP_WORK_DIR ]] ||
        fail 3 'BACKUP_WORK_DIR debe existir y permitir escritura.'
    private_path "$BACKUP_WORK_DIR" || fail 3 'BACKUP_WORK_DIR debe ser privado y propio.'
}

archive_hash() {
    local digest
    digest=$(sha256sum < "$1") || return 1
    printf '%s\n' "${digest%% *}"
}

archive_size() { stat -c '%s' -- "$1"; }

validate_archive() {
    local file=$1 catalog=$2 table
    [[ -s $file ]] || return 1
    timeout 45 pg_restore --list "$file" > "$catalog" 2>/dev/null || return 1
    for table in perfiles categorias proveedores productos ventas detalle_ventas movimientos_inventario predicciones; do
        grep -Eq "^[0-9]+; [0-9]+ [0-9]+ TABLE public $table " "$catalog" &&
            grep -Eq "^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public $table " "$catalog" || return 1
    done
    grep -Eq ' FUNCTION public registrar_venta\(' "$catalog" &&
        grep -Eq ' FUNCTION public get_auth_user_role\(' "$catalog" &&
        grep -Eq ' SEQUENCE SET public ventas_id_seq ' "$catalog" || return 1
    # Leer también los bloques de datos. El catálogo por sí solo no los valida.
    timeout 300 pg_restore --file=/dev/null "$file" >/dev/null 2>&1
}

valid_backup_key() {
    [[ $1 =~ ^backups/(daily/[0-9]{4}-[0-9]{2}-[0-9]{2}|weekly/[0-9]{4}-W[0-9]{2})/[0-9]{8}T[0-9]{6}Z-[a-zA-Z0-9]{8}\.dump$ ]]
}

s3() (
    unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN AWS_PROFILE AWS_DEFAULT_PROFILE AWS_CREDENTIAL_FILE
    unset AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_CONTAINER_CREDENTIALS_RELATIVE_URI AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN
    unset AWS_ENDPOINT_URL AWS_ENDPOINT_URL_S3 AWS_EC2_METADATA_DISABLED
    export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null BOTO_CONFIG=/dev/null
    export AWS_IGNORE_CONFIGURED_ENDPOINT_URLS=true
    timeout 300 aws --no-cli-pager --region "$AWS_REGION" --output text --cli-connect-timeout 8 \
        --cli-read-timeout 60 s3api "$@" 2>/dev/null
)

object_head() {
    local mode=$1 key=$2 version=$3
    local -a version_arg=()
    [[ -z $version || $version == None ]] || version_arg=(--version-id "$version")
    if [[ $mode == fixture ]]; then
        cat -- "$BACKUP_FIXTURE_DIR/$key.meta" 2>/dev/null
    else
        local -a args=(head-object --bucket "$AWS_S3_BACKUP_BUCKET" --key "$key" "${version_arg[@]}"
            --query '[ContentLength,Metadata.sha256,Metadata."captured-at",Metadata.format,ServerSideEncryption,VersionId,ChecksumSHA256]')
        s3 "${args[@]}" --checksum-mode ENABLED || s3 "${args[@]}"
    fi
}

object_download() {
    local mode=$1 key=$2 version=$3 destination=$4
    local -a version_arg=()
    [[ -z $version || $version == None ]] || version_arg=(--version-id "$version")
    if [[ $mode == fixture ]]; then
        cp -- "$BACKUP_FIXTURE_DIR/$key" "$destination" 2>/dev/null
    else
        s3 get-object --bucket "$AWS_S3_BACKUP_BUCKET" --key "$key" "${version_arg[@]}" "$destination" >/dev/null
    fi
}

object_put() {
    local mode=$1 key=$2 file=$3 bytes=$4 sha=$5 captured=$6
    local version checksum target
    if [[ $mode == fixture ]]; then
        [[ ${BACKUP_FIXTURE_FAIL:-} != transfer ]] || return 1
        target=$BACKUP_FIXTURE_DIR/$key
        version=fixture-$sha
        mkdir -p -- "${target%/*}" && [[ ! -e $target && ! -e $target.meta ]] || return 1
        cp -- "$file" "$target" || return 1
        printf '%s\t%s\t%s\tpg-custom-v1\tfixture\t%s\tNone\n' "$bytes" "$sha" "$captured" "$version" \
            > "$target.meta" || return 1
        printf '%s\n' "$version"
    else
        checksum=$(openssl dgst -sha256 -binary "$file" | base64 -w0) || return 1
        s3 put-object --bucket "$AWS_S3_BACKUP_BUCKET" --key "$key" --body "$file" \
            --server-side-encryption AES256 --checksum-algorithm SHA256 --checksum-sha256 "$checksum" \
            --if-none-match '*' --content-type application/octet-stream \
            --metadata "sha256=$sha,captured-at=$captured,format=pg-custom-v1" --query VersionId
    fi
}

# Lee y valida los campos de HEAD, sin tratar metadata del proveedor como código.
read_head() {
    local mode=$1 key=$2 requested_version=$3 header expected_encryption
    expected_encryption=AES256
    [[ $mode != fixture ]] || expected_encryption=fixture
    header=$(object_head "$mode" "$key" "$requested_version") || return 1
    [[ $header != *$'\n'* ]] || return 1
    IFS=$'\t' read -r object_bytes object_sha object_captured object_format object_encryption object_version object_checksum \
        <<< "$header" || return 1
    [[ $object_bytes =~ ^[1-9][0-9]*$ && $object_sha =~ ^[0-9a-f]{64}$ &&
       $object_captured =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ &&
       $object_format == pg-custom-v1 && $object_encryption == "$expected_encryption" && -n $object_version &&
       ( -z $requested_version || $requested_version == "$object_version" ) ]]
}

verify_transfer() {
    local mode=$1 key=$2 version=$3 file=$4 downloaded=$5 digest
    read_head "$mode" "$key" "$version" || return 1
    [[ $mode != fixture || ${BACKUP_FIXTURE_FAIL:-} != verify ]] || return 1
    [[ $object_bytes == "$size" && $object_sha == "$sha" && $object_captured == "$captured" ]] || return 1
    if [[ $mode == s3 && $object_checksum =~ ^[a-zA-Z0-9+/]{43}=$ ]]; then
        digest=$(openssl dgst -sha256 -binary "$file" | base64 -w0) || return 1
        [[ $digest == "$object_checksum" ]]
    else
        object_download "$mode" "$key" "$object_version" "$downloaded" &&
            [[ $(archive_size "$downloaded") == "$size" && $(archive_hash "$downloaded") == "$sha" ]]
    fi
}
