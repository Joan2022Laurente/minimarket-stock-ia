#!/bin/sh
set -eu

if ! printf '%s\n' "${SITE_ADDRESS:-}" | awk -F. '
    NR != 1 || NF < 2 || length($0) > 253 { exit 1 }
    {
        for (i = 1; i <= NF; i++) {
            if (length($i) > 63 || $i !~ /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/) exit 1
        }
        if ($NF !~ /[A-Za-z]/ || tolower($NF) ~ /^(local|localhost|test|invalid|example|internal|onion)$/) exit 1
    }
'; then
    printf '%s\n' 'SITE_ADDRESS debe ser un hostname DNS completo, sin esquema, IP, puerto ni comodines.' >&2
    exit 78
fi

case "${ACME_EMAIL:-}" in
    ''|*[!a-zA-Z0-9._%+@-]*|*@*@*|@*|*@)
        printf '%s\n' 'ACME_EMAIL debe contener un correo de contacto valido.' >&2
        exit 78 ;;
    *@*.*) ;;
    *)
        printf '%s\n' 'ACME_EMAIL debe contener un correo de contacto valido.' >&2
        exit 78 ;;
esac

case "${ACME_CA:-staging}" in
    staging) ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory ;;
    production) ACME_CA=https://acme-v02.api.letsencrypt.org/directory ;;
    *)
        printf '%s\n' 'ACME_CA debe ser staging o production.' >&2
        exit 78 ;;
esac
export ACME_CA

exec caddy "$@" --config /etc/caddy/Caddyfile --adapter caddyfile
