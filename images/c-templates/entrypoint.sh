#!/bin/bash
set -e

TEMPLATES_DIR="/home/theia/templates"

if [ -n "$TEMPLATE" ]; then
    # Validate against path traversal (e.g. TEMPLATE="../../etc")
    TEMPLATE_PATH="$(realpath -m "${TEMPLATES_DIR}/${TEMPLATE}")"
    case "$TEMPLATE_PATH" in
        "${TEMPLATES_DIR}/"*) ;; # path is under TEMPLATES_DIR — OK
        *) echo "ERROR: Invalid template name '${TEMPLATE}'" >&2; exit 1 ;;
    esac
    if [ ! -d "$TEMPLATE_PATH" ]; then
        echo "ERROR: No template found for '${TEMPLATE}'" >&2
        if [ -d "$TEMPLATES_DIR" ]; then
            echo "Available templates:" >&2
            ls -1 "$TEMPLATES_DIR" >&2
        fi
        exit 1
    fi
    echo "Loading template '${TEMPLATE}'..."
    cp -rn "$TEMPLATE_PATH/." /home/project/
fi

# Configure the Bazel remote build cache from the environment.
# The operator injects BUILD_CACHE_ENABLED / BAZEL_BUILD_CACHE_URL / BUILD_CACHE_PUSH.
# Bazelrc files cannot read env vars, so we generate ~/.bazelrc here. Bazel reads
# the home bazelrc automatically for every invocation, layered over the project
# .bazelrc, so the template still works offline when no cache is configured.
BAZELRC="${HOME}/.bazelrc"
if [ "${BUILD_CACHE_ENABLED,,}" = "true" ] && [ -n "${BAZEL_BUILD_CACHE_URL}" ]; then
    upload="false"
    [ "${BUILD_CACHE_PUSH,,}" = "true" ] && upload="true"
    {
        echo "build --remote_cache=${BAZEL_BUILD_CACHE_URL}"
        echo "build --remote_upload_local_results=${upload}"
    } > "$BAZELRC"
    echo "[Build Cache] Bazel remote cache ENABLED (push: ${upload})"
else
    # Remove any stale auto-generated cache config from a previous run.
    [ -f "$BAZELRC" ] && rm -f "$BAZELRC"
    echo "[Build Cache] Bazel remote cache disabled"
fi

exec node /home/theia/applications/browser/lib/backend/main.js "$@"
