#!/usr/bin/env bash
set -Eeuo pipefail
export MSYS_NO_PATHCONV=1
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
skopeo_image=quay.io/skopeo/stable@sha256:a585e4a3b8a045baa87c7f1b2f940d6d299ebede85ab3f2419d52d2264eefc93
trivy_image=aquasec/trivy@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb
[[ $# == 3 && -d $2 && $3 =~ ^buenvecino-(init006|ci-[a-z0-9-]+)$ ]] || {
    echo 'Uso: ci-images.sh build|scan DIRECTORIO PROYECTO' >&2
    exit 2
}
work=$(cd -- "$2" && pwd -P)
project=$3
arch=${CI_ARCH:-amd64}

native_path() {
    if command -v cygpath >/dev/null; then cygpath -am "$1"; else printf '%s' "$1"; fi
}
mount_work="type=bind,source=$(native_path "$work"),target=/work"
python=python3
command -v "$python" >/dev/null || python=python
manifest="$(native_path "$root/deploy/scripts/candidate.py")"

case "$1" in
    build)
        [[ $arch == amd64 || $arch == arm64 ]]
        [[ $(docker version --format '{{.Server.Os}}/{{.Server.Arch}}') == "linux/$arch" ]] || {
            echo 'Se requiere un Docker Engine Linux de arquitectura nativa' >&2; exit 3;
        }
        revision=${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}
        repository=${GITHUB_REPOSITORY:?Configure GITHUB_REPOSITORY}
        [[ $revision =~ ^[a-f0-9]{40}$ && $repository =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]
        builder=$project-builder
        docker buildx create --name "$builder" --driver docker-container >/dev/null
        trap 'docker buildx rm "$builder" >/dev/null' EXIT
        for part in backend frontend; do
            tag=minimarket-$part:$project
            docker buildx build --builder "$builder" --platform "linux/$arch" --provenance=false --sbom=false \
                --label "org.opencontainers.image.source=https://github.com/$repository" \
                --label "org.opencontainers.image.revision=$revision" \
                --output "type=oci,dest=$(native_path "$work/$part.oci.tar")" \
                "$(native_path "$root/$part")"
            docker run --rm --network none --mount "$mount_work" "$skopeo_image" copy \
                "oci-archive:/work/$part.oci.tar" "docker-archive:/work/$part.docker.tar:$tag"
            docker load --input "$(native_path "$work/$part.docker.tar")"
            docker image inspect "$tag" | "$python" "$manifest" inspect "$(native_path "$work/$part.oci.tar")" \
                --docker-archive "$(native_path "$work/$part.docker.tar")"
        done
        docker run --rm --network none --entrypoint python "minimarket-backend:$project" -c '
import importlib.util, os
from pathlib import Path
import fastapi, lightgbm, psycopg2, python_multipart
assert os.getuid() == 10001
assert importlib.util.find_spec("pytest") is None
assert not list(Path("/app").rglob(".env*")) and not list(Path("/app").rglob("*.dump"))
print("PASS runtime backend: imports, UID 10001 y contenido de imagen")
'
        docker run --rm --network none --entrypoint python "minimarket-backend:$project" -m pip check
        docker image inspect --format '{{json .Config.Cmd}}' "minimarket-backend:$project" |
            "$python" -c 'import json,sys; args=json.load(sys.stdin); assert args[args.index("--workers")+1]=="1"'
        ;;
    scan)
        mkdir -p "$work/trivy" "$work/reports" "$work/locks"
        cp "$root/frontend/package-lock.json" "$work/locks/"
        trivy=(docker run --rm --mount "$mount_work" "$trivy_image")
        for part in backend frontend; do
            "${trivy[@]}" image --cache-dir /work/trivy --timeout 8m \
                --scanners vuln --image-config-scanners misconfig --list-all-pkgs --format json --exit-code 0 \
                --input "/work/$part.docker.tar" --output "/work/reports/$part.json"
        done
        "${trivy[@]}" fs --cache-dir /work/trivy --timeout 8m --scanners vuln \
            --include-dev-deps --list-all-pkgs --format json --exit-code 0 --output /work/reports/frontend-lock.json /work/locks
        ;;
    *) exit 2 ;;
esac
