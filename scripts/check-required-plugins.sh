#!/bin/sh
# Fails if a language image lost an extension that EduIDE itself depends on.
# A language patch can null any plugin of the base (thm-java-25 did so for
# scorpio and data-bridge), and nothing else would notice.
#
#   check-required-plugins.sh --package-json <file>   theiaPlugins of the merged package.json
#   check-required-plugins.sh [plugins-dir]            plugins folder of the finished image
#
# Both run in every ToolDockerfile. The package.json check is the one that can
# fail: the final stage copies /home/theia from the base first and the plugin
# stage's plugins/ on top (a merge), so a nulled plugin is never removed from
# the folder, only from package.json.
set -eu

required="theia-cloud-monitor scorpio data-bridge"
missing=""

if [ "${1:-}" = "--package-json" ]; then
    file="${2:?usage: $0 --package-json <file>}"
    for plugin in $required; do
        node -e '
const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const url = (p.theiaPlugins || {})[process.argv[2]];
process.exit(typeof url === "string" && url.length > 0 ? 0 : 1);' "$file" "$plugin" || missing="$missing $plugin"
    done
    where="theiaPlugins in $file"
else
    dir="${1:-/home/theia/plugins}"
    for plugin in $required; do
        [ -d "$dir/$plugin" ] || missing="$missing $plugin"
    done
    where="$dir"
fi

if [ -n "$missing" ]; then
    echo "ERROR: required plugins missing from $where:$missing" >&2
    exit 1
fi
echo "Required plugins present in $where: $required"
