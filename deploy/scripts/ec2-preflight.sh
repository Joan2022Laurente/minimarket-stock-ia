#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if command -v python3 >/dev/null; then
    exec python3 "$SCRIPT_DIR/ec2_preflight.py" "$@"
fi
if command -v python >/dev/null; then
    exec python "$SCRIPT_DIR/ec2_preflight.py" "$@"
fi
printf '%s\n' 'BLOCKED Python 3.11+ no está disponible.' >&2
exit 3
