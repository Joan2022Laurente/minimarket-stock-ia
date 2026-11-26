#!/bin/sh
set -eu

case "${ENVIRONMENT:-production}" in
    development|test) ;;
    *)
        echo 'Inicio bloqueado: la autenticacion y la persistencia productivas requieren cierre de INIT-001.' >&2
        exit 78
        ;;
esac

exec "$@"
