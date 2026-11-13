# AGENTS.md — EduIDE

The IDE itself, and the image factory that produces every variant students use.
A fork of Eclipse Theia's `theia-ide` blueprint, heavily reworked.

`CLAUDE.md` is a symlink to this file, so every agent reads the same thing.

## Layout

```
images/base-ide/BaseDockerfile      the base image: Theia, Scorpio, data bridge, no Artemis extension
images/base-standalone/Dockerfile   thin layer FROM base: git credential cache
images/base-artemis/Dockerfile      thin layer FROM base: Artemis extension
images/<lang>/ToolDockerfile        one per language, built once per edition
images/<lang>/templates/<id>/       project templates, each with a template.json
applications/browser/               the Theia browser app
theia-extensions/product/           branding and product extension
scripts/                            build-time TypeScript, the package.json merge, check-required-plugins.sh and smoke-test-image.sh
docker-compose.images.yml           how to build and run every image locally
.github/workflows/build.yml         what CI publishes
docs/how-to-build-ide-variants.md   the fuller walkthrough; more current than this file
docs/base-image-lifecycle.md        which distro each image sits on, and when it expires
```

## What is actually published

`base`, `base-standalone` and `base-artemis`, plus ten language images from the
matrix in `.github/workflows/build.yml` under the **`images`** job: each of
`java-17`, `java-25`, `python`, `javascript` and `c`, built twice from the same
`ToolDockerfile`, once as `<lang>-standalone` (on `base-standalone`) and once
as `<lang>-artemis` (on `base-artemis`).

`haskell`, `ocaml` and `rust` still have their directories and compose services,
so they build locally, but CI no longer publishes them. To bring one back, add
its matrix entries again and a catalog entry in EduIDE-Helm.

Do not hardcode that list anywhere. EduIDE-Helm's release train reads it from
the matrix at run time (`.jobs.images.strategy.matrix.include[]["image-name"]`),
because a hand-kept copy went stale within days of being written and a release
nearly shipped pinning two tags that were never built. Keep the job named
`images` and the entries flat.

**Editions live in the base, not in the language images.** `base` has Scorpio,
the data bridge and `theia-cloud-monitor`. `base-standalone` adds
a global git config with `credential.helper = cache --timeout=10800`.
`base-artemis` adds `artemis-extension` to `plugins/` **and** to `package.json`
`theiaPlugins`, because every language image's `yarn download:plugins:smart`
prunes `plugins/` against `package.json` and would delete it otherwise. The
Artemis pin is `ARTEMIS_EXTENSION_URL` in `images/base-artemis/Dockerfile`.
A `ToolDockerfile` must stay edition-agnostic: no Artemis, no git config.

Every `ToolDockerfile` runs `scripts/check-required-plugins.sh` twice: in the
plugin stage right after the `package.json` merge (fails if `theiaPlugins`
lacks or nulls `theia-cloud-monitor`, `scorpio` or `data-bridge`; this is the
check that can fail, because the final stage merges plugin folders instead of
replacing them) and at the end on the finished `plugins/` folder. CI then runs
`scripts/smoke-test-image.sh` on every image, including each template's Test
task (default build task if it has none) under `--network none`. Templates
marked `needsNetwork` (Maven, Gradle, Bazel) run with network.

**Templates** live in `images/<lang>/templates/<id>/` with a `template.json`
(`label`, `description`, `order`, optional `needsNetwork`), are copied to `/home/theia/templates/<id>/`,
and are applied by Scorpio, not by an entrypoint. The only entrypoint left is
`images/c/entrypoint.sh`, which writes the Bazel remote cache config from
runtime env. Renovate leaves `images/*/templates/**` alone.

## Traps

**The Theia backend has no auth of its own; it must never be reachable except
through the authenticating proxy/gateway.** A direct TCP connection to the
backend port (3000) is an unauthenticated session - file access, a terminal,
task execution, the lot. In production the only thing allowed to reach it is
the in-pod `oauth2-proxy` sidecar, which authenticates every request and
forwards to `http://127.0.0.1:<port>` over the pod's shared loopback
(EduIDE-Helm's `oauth2-proxy-config` ConfigMap). Because the proxy reaches the
IDE over loopback, the published images bind the backend to `127.0.0.1`
(`--hostname=127.0.0.1` in each `ToolDockerfile` `CMD`), **not** `0.0.0.0`. Do
not widen that bind, and do not disable `warnOnPotentiallyInsecureHostPattern`
in `applications/browser/package.json` - that warning is the signal that would
surface an accidental `0.0.0.0` exposure. The pod network / NetworkPolicy must
still ensure nothing but the proxy can reach port 3000 (handled in EduIDE-Helm);
the loopback bind is defence in depth, not the only line.
Local-only caveat: Docker port forwarding cannot reach a loopback-only bind, so
`docker-compose.images.yml` overrides the hostname back to `0.0.0.0` per service
for local testing. That override is for the host-only compose setup and must
never be carried into k8s.

**Theia >= 1.74 bundles AI code even though EduIDE ships no AI packages.**
`@theia/plugin-ext` has a hard dependency on `@theia/ai-core` and
`@theia/ai-mcp` (for the VS Code `lm` plugin API and MCP support), and
ai-core's default activation service reports AI as *active*. The product
extension neutralizes this: `DisabledAIActivationService` rebinds
`AIActivationService` and `ViewsFilter` filters the AI/MCP contributions
(both in `theia-extensions/product/src/browser/theia-ide-contribution.tsx`).
Do not remove those bindings, and re-check them on every Theia upgrade.
Details in `docs/theia-1.74.1-upgrade.md`.

**Every base image has an expiry date, and apt does not fail honestly when it
passes.** Debian 11 went EOL on 2026-08-31 and took the v1.2.1 release build
with it: `apt-get update` kept succeeding against a frozen `bullseye-security`
index while the `.deb` files behind it had been purged, so the build 404'd on a
single package and looked like a flaky mirror. Everything sits on
`node:22-trixie` and `ubuntu:26.04` now - pick the suite that is current
stable, not one already handed to the LTS team. Apt only meets the live
mirrors on the nightly `schedule` run and on a `workflow_dispatch` with
`disable_layer_cache`; every other trigger reuses the cached layer, so the
nightly is the standing early warning. When it goes red, the next release is
already broken. `docs/base-image-lifecycle.md`.

**There are two `package.json` merge implementations and the wrong one loses
data.** `scripts/merge-package-json.js` unions `theiaPluginsExcludeIds` and
honours `theiaPluginsExcludeIdsRemove`. An inline `node -e "…deepMerge…"` in
several ToolDockerfiles **replaces arrays wholesale**, so a patch that sets
`theiaPluginsExcludeIds` silently drops the base image's ~75 exclusions. The
plain images are split between the two. If you copy an existing ToolDockerfile
as a starting point, copy one that uses the script — `images/java-17` — not
`images/c`.

**`@theia/cli` is pinned in every ToolDockerfile.** Language images do not
re-run `yarn install`; they `COPY --from=base-ide /home/theia/node_modules` and
then `yarn add -W @theia/cli@<version>`. Bumping the root `package.json` without
bumping that literal in all sixteen leaves them building against two versions.

**Builds run `yarn download:plugins:smart`, not `download:plugins`.** The plain
script still exists and is not what anything uses.

**`BaseDockerfile` restores the merged `package.json` after `COPY . .`.** The
sequence copies the repo over the merged file, splats `images/base-ide/` across
the root, then restores from `package.json.merged`. Reordering those lines
silently reverts the base image to the root plugin config.

**Several per-image `settings.json` files contain trailing commas**, such as
`images/base-ide/project/.vscode/settings.json`. Theia
reads JSONC and tolerates them; `jq` and `JSON.parse` do not. Do not "fix" them
with a tool that reformats.

**Settings go in a `.vscode` directory, not a `.theia` one.** Theia reads the
former. The three retired `-no-ls` images use the latter and are not a pattern
to copy.

## Dead weight, so you do not mistake it for live code

Retired when the language-server images were dropped, directories left in place:

```
images/java-17-no-ls/  images/rust-no-ls/  images/theia-no-ls/
images/languageserver/{java,rust}/
```

Their READMEs still advertise `ghcr.io/eduide/eduide/langserver-*` tags that are
no longer produced. Nothing builds them.

`images/swift/` builds locally through `docker-compose.images.yml` (port 3008)
but is in no build matrix, so it is never published. The root README lists it as
available, which is wrong.

`images/README.md` and `PUBLISHING.md` are largely upstream Eclipse Theia text:
they document a `jq`-based merge nothing uses, an `images/base-ide/package.json`
that does not exist, publishing to `ghcr.io/eclipse-theia/…`, and a Kotlin image
with no directory. Treat them as debt, not as a source of truth.

`.github/workflows/scorpio_auto_update.yml` is dead on two counts: it targets
`images/base-ide/package.json`, which does not exist, and greps for the
`tum-aet/artemis-scorpio` namespace while the real pin in
`images/base-ide/package.json.patch` uses `aet-tum/artemis-scorpio`.

`lerna.json` says `1.70.200` and `package.json` says `1.70.201`. Both track
upstream Theia. Pick deliberately if you touch either.

## Building

```bash
# base first - everything else is FROM it
docker build -f images/base-ide/BaseDockerfile -t theia-base:local .

# then one language image
docker build --build-arg BASE_IMAGE=theia-base:local \
  -f images/java-17/ToolDockerfile -t eduide-java-17:local .

# or the lot, with the base wired in as an additional context
docker compose -f docker-compose.images.yml build
```

CI threads the base image's **immutable sha tag** into every language build
(`BASE_IDE_TAG`), so they cannot pick up a drifting base. Locally that is what
`additional_contexts` in the compose file does.

## Adding an image

1. `images/<lang>/ToolDockerfile` — copy `images/java-17`, not `images/c`
2. Its `package.json.patch` and VS Code settings, modelled on
   `images/java-17/project/.vscode/settings.json`
   plus `templates/<id>/` folders, each with a `template.json`
3. Two services in `docker-compose.images.yml` on the next free ports, one per edition
4. Two matrix entries under the **`images`** job in `.github/workflows/build.yml`
   (`<lang>-standalone`, `<lang>-artemis`), and the language in the `smoke` job matrix
5. Keep the `EDUIDE_IMAGE_NAME` / `EDUIDE_IMAGE_TAG` / `EDUIDE_IMAGE_REVISION`
   stamp at the end of the final stage - it is what the About dialog shows, and
   an image without it reports its version as `unknown`

Then add it to EduIDE-Helm's `eduide` chart, which is what actually offers it
to students. Building an image deploys nothing on its own.

`docs/how-to-build-ide-variants.md` is the longer version and is current.

## Conventions

- The `theia` user is uid 101 in every image.
- Electron code is deleted during the base build; do not add to it.
- Release tags are `vX.Y.Z`; the image tag is the same string without the `v`.
- Every image stamps its own name, tag and commit into `EDUIDE_IMAGE_NAME` /
  `EDUIDE_IMAGE_TAG` / `EDUIDE_IMAGE_REVISION` at build time
  (`stamp-app-version: true` plus `IMAGE_NAME` and `IMAGE_REVISION` build args),
  and the About dialog reads them back through Theia's `EnvVariablesServer`.
  That is how a session says which image it is running.
  `docs/how-to-build-ide-variants.md`.
- Workflows must pass `actionlint`.
