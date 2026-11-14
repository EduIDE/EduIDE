#!/bin/bash
set -e

# Configure the Bazel remote build cache from the environment.
# The operator injects BUILD_CACHE_ENABLED / BAZEL_BUILD_CACHE_URL / BUILD_CACHE_PUSH.
# Bazelrc files cannot read env vars, so we generate ~/.bazelrc here. Bazel reads
# the home bazelrc automatically for every invocation, layered over the project
# .bazelrc, so the template still works offline when no cache is configured.
# Templates are not handled here: Scorpio copies them into the workspace.
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
    rm -f "$BAZELRC"
    echo "[Build Cache] Bazel remote cache disabled"
fi

exec node /home/theia/applications/browser/lib/backend/main.js "$@"
