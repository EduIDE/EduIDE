#!/bin/bash
set -e

# Use standard port and workspace path, configurable via env
SERVER_PORT=${LS_PORT:-5000}
WORKSPACE=${WORKSPACE_PATH:-/home/project}
JDTLS_DATA_DIR=${JDTLS_DATA_PATH:-/home/app/.jdtls-workspace}
JDTLS_IMPORT_EXCLUSIONS=${JDTLS_IMPORT_EXCLUSIONS:-"**/lost+found/**"}

LAUNCHER_JAR=$(find /opt/jdt-ls/plugins -name "org.eclipse.equinox.launcher_*.jar" | head -n 1)

if [ -z "$LAUNCHER_JAR" ] || [ ! -f "$LAUNCHER_JAR" ]; then
  echo "[LS-JAVA] ERROR: Could not find Eclipse Equinox launcher JAR" >&2
  exit 1
fi

mkdir -p "${JDTLS_DATA_DIR}"

# Seed JDT LS instance preferences so inaccessible PVC system folders are ignored.
JDTLS_PREFS_DIR="${JDTLS_DATA_DIR}/.metadata/.plugins/org.eclipse.core.runtime/.settings"
mkdir -p "${JDTLS_PREFS_DIR}"
cat <<EOF > "${JDTLS_PREFS_DIR}/org.eclipse.jdt.ls.core.prefs"
eclipse.preferences.version=1
java.import.exclusions=${JDTLS_IMPORT_EXCLUSIONS}
EOF

cat <<EOF > /tmp/run-jdt.sh
#!/bin/bash
exec java \
  -Declipse.application=org.eclipse.jdt.ls.core.id1 \
  -Dosgi.bundles.defaultStartLevel=4 \
  -Declipse.product=org.eclipse.jdt.ls.core.product \
  -Djava.import.exclusions="${JDTLS_IMPORT_EXCLUSIONS}" \
  -Dlog.level=ALL \
  -Xmx1G \
  --add-modules=ALL-SYSTEM \
  --add-opens=java.base/java.util=ALL-UNNAMED \
  --add-opens=java.base/java.lang=ALL-UNNAMED \
  -jar "${LAUNCHER_JAR}" \
  -configuration /opt/jdt-ls/config_linux \
  -data "${JDTLS_DATA_DIR}"
EOF

chmod +x /tmp/run-jdt.sh

echo "[LS-JAVA] Starting Java Language Server on port ${SERVER_PORT} with project ${WORKSPACE} and data dir ${JDTLS_DATA_DIR}"
exec socat TCP-LISTEN:${SERVER_PORT},reuseaddr,fork EXEC:/tmp/run-jdt.sh
