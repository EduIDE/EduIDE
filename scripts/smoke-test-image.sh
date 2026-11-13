#!/usr/bin/env bash
# Smoke test for one built language image.
#
#   scripts/smoke-test-image.sh <image> <standalone|artemis>
#
# Checks that the IDE answers on :3000, that the required extensions are present
# (the Artemis extension only in the artemis edition), that the git credential
# cache is set only in standalone, that the language toolchain runs, and that
# every project template passes its Test task (or, without one, its default build task) without network access, unless its template.json says "needsNetwork": true.
# It also writes the image's template list to templates-<image>.json in
# $SMOKE_OUT_DIR (default: the current directory); CI uploads it as an artifact.
# Not covered: the real Artemis flow (autoclone, Iris), checked by hand on staging.
set -u

image="${1:?usage: $0 <image> <standalone|artemis>}"
edition="${2:?usage: $0 <image> <standalone|artemis>}"
case "$edition" in standalone | artemis) ;; *) echo "edition must be standalone or artemis" >&2; exit 2 ;; esac

out_dir="${SMOKE_OUT_DIR:-.}"
name="${image##*/}"
name="${name%%:*}"
lang="${name#eduide-}"
lang="${lang%-"$edition"}"

failures=0
pass() { echo "ok    $*"; }
fail() { echo "FAIL  $*"; failures=$((failures + 1)); }
note() { echo "note  $*"; }

container=""
cleanup() { [ -n "$container" ] && docker rm -f "$container" > /dev/null 2>&1; }
trap cleanup EXIT

# --- 1. IDE answers on :3000 ---------------------------------------------
# The images bind 127.0.0.1 inside the container; override it so the published
# port is reachable from the host (same as docker-compose.images.yml).
container="$(docker run -d --rm -p 127.0.0.1::3000 "$image" /home/project --hostname=0.0.0.0)" || { fail "container does not start"; exit 1; }
port="$(docker port "$container" 3000/tcp | head -1 | sed 's/.*://')"
status=000
for _ in $(seq 1 60); do
    status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/" || true)"
    [ "$status" = 200 ] && break
    sleep 2
done
[ "$status" = 200 ] && pass "IDE answers HTTP 200 on :3000" || fail "IDE answers HTTP $status on :3000"

in_container() { docker exec "$container" sh -c "$1" > /dev/null 2>&1; }
check() { # check <description> <command run in the container>
    if in_container "$2"; then pass "$1"; else fail "$1 ($2)"; fi
}

# --- 2. extensions and edition --------------------------------------------
for plugin in theia-cloud-monitor scorpio data-bridge; do
    check "plugin $plugin present" "test -d /home/theia/plugins/$plugin"
done
if [ "$edition" = artemis ]; then
    check "artemis-extension present" "test -d /home/theia/plugins/artemis-extension"
    check "artemis-extension kept in package.json" "grep -q '\"artemis-extension\"' /home/theia/package.json"
    check "no git credential cache" "! git config --global --get credential.helper | grep -q cache"
else
    check "artemis-extension absent" "! test -e /home/theia/plugins/artemis-extension"
    check "git credential cache set" "git config --global --get credential.helper | grep -qx 'cache --timeout=10800'"
fi

# --- 3. toolchain -----------------------------------------------------------
check "session user is uid 101, group theia gid 101" "[ \"\$(id -u)\" = 101 ] && [ \"\$(id -g)\" = 101 ] && [ \"\$(id -gn)\" = theia ]"
check "mini-browser host pattern set" "[ \"\$THEIA_MINI_BROWSER_HOST_PATTERN\" = '{{uuid}}.webview.{{hostname}}' ]"
check "ubuntu 26.04" "grep -q 'VERSION_ID=\"26.04\"' /etc/os-release"
for cmd in git ssh curl bash zsh less nano unzip; do
    check "common tool $cmd" "command -v $cmd"
done
case "$lang" in
    java-17) check "java 17" "java -version 2>&1 | grep -q '\"17\\.'"; check "javac" "javac -version"; check "mvn" "mvn -v" ;;
    java-25) check "java 25" "java -version 2>&1 | grep -q '\"25\\.'"; check "javac" "javac -version"; check "mvn" "mvn -v" ;;
    python)
        check "python3" "python3 --version"
        check "python3 -m venv" "python3 -m venv --help"
        check "pytest" "pytest --version"
        check "ruff" "ruff --version"
        check "uv" "uv --version"
        check "python packages" "python3 -c 'import debugpy, numpy, pandas, matplotlib'"
        check "plugin charliermarsh.ruff present" "test -d /home/theia/plugins/charliermarsh.ruff"
        ;;
    javascript)
        check "node 22" "node -v | grep -q '^v22\\.'"
        check "npm" "npm -v"
        check "tsc" "tsc -v"
        check "tsx" "tsx --version"
        check "@types/node global" "test -d /usr/local/lib/node_modules/@types/node"
        ;;
    c)
        for cmd in gcc clang clangd gdb make valgrind cmake clang-format; do check "$cmd" "$cmd --version"; done
        check "bazel" "cd /home/theia/templates/bazel && bazel version"
        check "codelldb adapter runs" "/home/theia/plugins/vadimcn.vscode-lldb/extension/adapter/codelldb --help"
        check "no sudo" "! command -v sudo"
        ;;
    rust)
        check "rustc" "rustc --version"
        check "cargo" "cargo --version"
        check "rustfmt" "rustfmt --version"
        check "clippy" "cargo clippy --version"
        check "rust-analyzer" "rust-analyzer --version"
        check "rust toolchain is pinned" "rustc --version | grep -q \"^rustc $(sed -n 's/^ARG RUST_VERSION=//p' "$(dirname "$0")/../images/rust/ToolDockerfile")\""
        check "plugin rust-analyzer present" "test -d /home/theia/plugins/rust-analyzer"
        check "plugin vadimcn.vscode-lldb present" "test -d /home/theia/plugins/vadimcn.vscode-lldb"
        ;;
    go)
        check "go" "go version"
        check "go toolchain is pinned" "go version | grep -q \"go$(sed -n 's/^ARG GO_VERSION=//p' "$(dirname "$0")/../images/go/ToolDockerfile") \""
        check "gopls" "gopls version"
        check "dlv" "dlv version"
        check "staticcheck" "staticcheck -version"
        check "plugin golang.go present" "test -d /home/theia/plugins/golang.go"
        ;;
    *) fail "unknown language '$lang' derived from image name '$name'" ;;
esac

# --- 4. templates ------------------------------------------------------------
# Printed by node (always in the image) so no jq is needed on the host or inside.
list_js='
const fs = require("fs"), dir = "/home/theia/templates";
const out = [];
for (const id of fs.readdirSync(dir)) {
  const f = dir + "/" + id + "/template.json";
  if (!fs.existsSync(f)) continue;
  const t = JSON.parse(fs.readFileSync(f, "utf8"));
  out.push({ id, label: t.label, order: t.order, needsNetwork: t.needsNetwork === true });
}
out.sort((a, b) => a.order - b.order);
console.log(JSON.stringify(out, null, 2));'
mkdir -p "$out_dir"
templates_json="$out_dir/templates-${name}.json"
if docker run --rm --entrypoint node "$image" -e "$list_js" > "$templates_json"; then
    pass "template list written to $templates_json"
else
    fail "cannot list templates"
    echo "[]" > "$templates_json"
fi

# Prints "test <command>" for the task in group "test"; without one,
# "build <command>" for the default build task (Run), or nothing.
test_cmd_js='
const fs = require("fs");
const raw = fs.readFileSync(process.argv[1] + "/.vscode/tasks.json", "utf8").replace(/^\s*\/\/.*$/gm, "");
const tasks = JSON.parse(raw).tasks || [];
const kind = t => (t.group && t.group.kind) || t.group;
const test = tasks.find(t => kind(t) === "test");
const build = tasks.find(t => kind(t) === "build" && t.group.isDefault);
if (test) console.log("test " + test.command);
else if (build) console.log("build " + build.command);'

# The host needs no node: the image's own node reads the list from stdin.
ids="$(docker run -i --rm --entrypoint node "$image" -e 'for (const t of JSON.parse(require("fs").readFileSync(0, "utf8"))) console.log(t.id + ":" + t.needsNetwork)' < "$templates_json")"

for entry in $ids; do
    id="${entry%%:*}"
    # --network none: a template must run with the toolchain in the image alone.
    # Exception: "needsNetwork": true in template.json (Maven and Gradle fetch
    # their plugins and distribution on first use; the images do not prefetch them).
    net=none
    if [ "${entry##*:}" = true ]; then net=bridge; note "template $id needs network (needsNetwork in template.json)"; fi
    # The copy goes into an empty directory, like Scorpio does it.
    result="$(docker run --rm --network "$net" --entrypoint sh "$image" -c '
        set -e
        id="$1"
        work="$(mktemp -d)"
        cp -rn "/home/theia/templates/$id/." "$work/"
        [ -f "$work/gradlew" ] && chmod +x "$work/gradlew"
        cmd="$(node -e "$2" "$work")"
        if [ -z "$cmd" ]; then echo "SKIP"; exit 0; fi
        cd "$work"
        echo "RUN ${cmd%% *} ${cmd#* }"
        sh -c "${cmd#* }"
    ' sh "$id" "$test_cmd_js" 2>&1)"
    rc=$?
    if echo "$result" | grep -qx 'SKIP'; then
        note "template $id has neither a test task nor a default build task, skipped"
    elif [ "$rc" -eq 0 ]; then
        run_line="$(echo "$result" | grep -m1 '^RUN ')"
        case "$run_line" in
            "RUN build "*) note "template $id has no test task, ran the default build task instead" ;;
        esac
        pass "template $id: $run_line"
    else
        fail "template $id: task failed"
        echo "$result" | tail -30
    fi
done

echo
if [ "$failures" -eq 0 ]; then echo "smoke test passed: $image ($edition)"; else echo "smoke test FAILED ($failures): $image ($edition)"; exit 1; fi
