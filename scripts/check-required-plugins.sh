#!/bin/sh
# Fails if a language image lost an extension that EduIDE itself depends on.
# A language patch can null any plugin of the base (thm-java-25 did so for
# scorpio and data-bridge), and nothing else would notice.
# Usage: check-required-plugins.sh [plugins-dir]
set -eu

dir="${1:-/home/theia/plugins}"
missing=""
for plugin in theia-cloud-monitor scorpio data-bridge; do
    [ -d "$dir/$plugin" ] || missing="$missing $plugin"
done

if [ -n "$missing" ]; then
    echo "ERROR: required plugins missing from $dir:$missing" >&2
    exit 1
fi
echo "Required plugins present: theia-cloud-monitor scorpio data-bridge"
