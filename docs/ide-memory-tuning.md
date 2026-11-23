# IDE memory tuning (all images)

Every session pod runs one IDE container, and its memory decides how many sessions fit on a node.
This page covers the settings that apply to every language image.
The Java language server and Gradle have their own page: [java-image-memory-tuning.md](java-image-memory-tuning.md).

## Where the memory goes

A session with one browser tab and one open file runs these processes (anonymous memory, 3.0.0-rc.10, arm64, three minutes after the template build):

| Process | MiB | Notes |
|---|---|---|
| Theia server (`main.js`) | 95-115 | |
| File watcher (`ipc-bootstrap`) | 30-50 | separate node process, see `--no-cluster` |
| Plugin host | 110-150 | one per browser tab |
| Spell checker server (cspell) | 110-185 | in every image once a file is open |
| JSON language server | 15-35 | |
| Language server | 50-600 | jedi ~50, clangd ~50, tsserver ~100, gopls ~120 after peaking near 300, rust-analyzer ~600, JDT LS 430-630 |

Totals per session before this tuning: c ~590, go ~610, python ~530, javascript ~635, rust ~1040, java-17 (Maven) ~900-1000.
The sidecars (agent 4 MiB, oauth2-proxy 5-6 MiB) are not worth tuning.

## Settings

| Setting | Where | Saves per session |
|---|---|---|
| `--no-cluster` | `ENTRYPOINT` in every `ToolDockerfile`, `images/c/entrypoint.sh` | 30-60 MiB |
| `MALLOC_ARENA_MAX=2` | `ENV` in every `ToolDockerfile` (the Java images had it already) | 80-100 MiB (python, javascript), ~200 MiB (rust) |
| `cSpell.enabled: false` | default preference in `applications/browser/package.json` | ~60 MiB (the server still starts, but loads no dictionaries) |
| `go telemetry off` | `images/go/ToolDockerfile` | ~20 MiB (the gopls telemetry child process) |

`scripts/smoke-test-image.sh` checks all four in every image.

All four together (cgroup `anon` in MiB, three minutes after the template build; the file watcher picked up a file created from outside in every image, and every template build passed):

| Image (template) | Before | After |
|---|---|---|
| c (make) | 590 | 308 |
| go | 606 | 398 |
| python | 530-550 | 349 |
| javascript (node) | 635 | 446 |
| rust (cargo) | 1043 | 750 |
| java-17 (maven) | 863-874 | 785 |
| java-17 (gradle) | ~1036 | 930 |
| java-25 (maven) | | 771 |

### `--no-cluster`

Theia's server starts the file watcher (`@parcel/watcher`) in a child node process unless `--no-cluster` is on the command line (`WATCHER_SINGLE_THREADED` in `@theia/filesystem`).
The flag only moves the watcher into the server process; Theia uses the same mode in its Electron app.
A crash in the native watcher now takes the server down with it instead of only the child, which Theia would have restarted.
We have not seen one in the measurements.

### `MALLOC_ARENA_MAX=2`

glibc gives every busy thread its own malloc arena (up to 8 per core).
Language servers and node keep freed memory spread over these arenas, so a 2-core pod on a many-core node holds memory nobody uses.
Two arenas cost no measurable speed in the template builds.
ENV does not travel from the base image, so every `ToolDockerfile` sets it.
It also applies to whatever students start in the terminal, which is the point.

### Spell checker off by default

The cspell language server loads its English and German dictionaries as soon as a file is open and costs more than most language servers.
The extension stays installed, and `cSpell.language` stays `en,de` in the project settings.
Students who want it turn it on with `"cSpell.enabled": true` in their user or workspace settings.
It is a default preference in `applications/browser/package.json` instead of a project setting, so it holds for every workspace, including cloned repositories, and any user or workspace setting overrides it.

### `go telemetry off`

gopls starts a telemetry upload child process unless the Go telemetry mode is `off`.
The mode lives in the `theia` user's config directory, so the `ToolDockerfile` sets it as that user.

## Considered and left out

- `NODE_OPTIONS=--max-semi-space-size`: no measurable effect.
- `rust-analyzer.cachePriming.enable: false` and `GOGC` for gopls: smaller peaks, but slower first navigation; not worth it by default.
- A second browser tab doubles the plugin host and every language server (Java: ~1470 instead of ~950 MiB).
  That needs a change in how sessions handle more than one tab, not an image setting.

## How it was measured

Each image ran locally in Docker with `--memory 3g --cpus 2`, with a template applied, the workbench loaded in headless Chromium, one source file open and the template's build run.
The numbers are `RssAnon` per process and `anon` of the container's cgroup, sampled one and three minutes after opening the file and three minutes after the build.
