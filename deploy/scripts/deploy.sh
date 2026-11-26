#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if command -v python3 >/dev/null; then
    exec python3 "$SCRIPT_DIR/release.py" deploy "$@"
fi
exec python "$SCRIPT_DIR/release.py" deploy "$@"
