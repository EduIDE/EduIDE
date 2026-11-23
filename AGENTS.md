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

`base`, `base-standalone` and `base-artemis`, plus fourteen language images from the
matrix in `.github/workflows/build.yml` under the **`images`** job: each of
`java-17`, `java-25`, `python`, `javascript`, `c`, `rust` and `go`, built twice from the same
`ToolDockerfile`, once as `<lang>-standalone` (on `base-standalone`) and once
as `<lang>-artemis` (on `base-artemis`).

Do not hardcode that list anywhere. EduIDE-Helm's release train reads it from
the matrix at run time (`.jobs.images.strategy.matrix.include[]["image-name"]`),
because a hand-kept copy went stale within days of being written and a release
nearly shipped pinning two tags that were never built. Keep the job named
`images` and the entries flat.

**Editions live in the base, not in the language images.** `base` has Scorpio and
`eduide-session` (replaces the data bridge and `theia-cloud-monitor`, built from the EduIDE-control-plane release commit in `images/base-ide/BaseDockerfile`). `base-standalone` adds
a global git config with `credential.helper = cache --timeout=10800`.
`base-artemis` adds the verified, unpacked `artemis-extension` to `plugins/` only,
not to `package.json` `theiaPlugins`: `yarn download:plugins:smart` would
re-download its URL without the checksum. The language images get the folder
because their final stage copies `/home/theia` from the base. The Artemis pin
and its SHA-256 are `ARTEMIS_EXTENSION_URL` and `ARTEMIS_EXTENSION_SHA256` in `images/base-artemis/Dockerfile`.
A `ToolDockerfile` must stay edition-agnostic: no Artemis, no git config.

Every `ToolDockerfile` runs `scripts/check-required-plugins.sh` twice: in the
plugin stage right after the `package.json` merge (fails if `theiaPlugins`
lacks or nulls `scorpio`; `eduide-session` is not in `theiaPlugins`; this is the
check that can fail, because the final stage merges plugin folders instead of
replacing them) and at the end on the finished `plugins/` folder (requires `scorpio` and `eduide-session`). CI then runs
`scripts/smoke-test-image.sh` on every image, including each template's Test
task (default build task if it has none) under `--network none`. Templates
marked `needsNetwork` (Maven, Gradle, Bazel) run with network.

**Templates** live in `images/<lang>/templates/<id>/` with a `template.json`
(`label`, `description`, `order`, optional `needsNetwork`), are copied to `/home/theia/templates/<id>/`,
and are applied by Scorpio, not by an entrypoint. The only entrypoint left is
`images/c/entrypoint.sh`, which writes the Bazel remote cache config from
runtime env. Renovate leaves `images/*/templates/**` alone.

## Traps

**The HTML preview only works because of an ENV in each `ToolDockerfile`.**
`THEIA_WEBVIEW_EXTERNAL_ENDPOINT` and `THEIA_MINI_BROWSER_HOST_PATTERN`, both `webview.{{hostname}}`, put webviews and the
mini-browser on one fixed host, which the gateway routes and has a
certificate for (no wildcard; control plane decision G3). ENV does not travel from the base image, so it must be in
every `ToolDockerfile`. Live Preview is not in the images: it serves on
`127.0.0.1` of the container. `docs/how-to-build-ide-variants.md`.

**The Theia backend has no auth of its own; it must never be reachable except
through the authenticating proxy/gateway.** A direct TCP connection to the
backend port (3000) is an unauthenticated session - file access, a terminal,
task execution, the lot. In production the only thing allowed to reach it is
the in-pod agent sidecar of the Go control plane, which accepts only requests
carrying the instance token the gateway adds after its own login check, and
forwards to `http://127.0.0.1:<port>` over the pod's shared loopback.
Because the agent reaches the IDE over loopback, the published images bind the backend to `127.0.0.1`
(`--hostname=127.0.0.1` in each `ToolDockerfile` `CMD`), **not** `0.0.0.0`. Do
not widen that bind, and do not disable `warnOnPotentiallyInsecureHostPattern`
in `applications/browser/package.json` - that warning is the signal that would
surface an accidental `0.0.0.0` exposure. The pod network / NetworkPolicy must
still ensure nothing but the gateway can reach the agent (handled by the control plane chart);
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
bumping that literal in all ten leaves them building against two versions.

**Builds run `yarn download:plugins:smart`, not `download:plugins`.** The plain
script still exists and is not what anything uses.

**`BaseDockerfile` restores the merged `package.json` after `COPY . .`.** The
sequence copies the repo over the merged file, splats `images/base-ide/` across
the root, then restores from `package.json.merged`. Reordering those lines
silently reverts the base image to the root plugin config.

**The images ship an empty `/home/project`.** Settings shared by all images live
in `theia.frontend.config.preferences` in `applications/browser/package.json`.
Language settings live in `images/<lang>/theia/user-settings.json`, copied to
`/home/theia/.theia-ide/settings.json`. Theia reads JSONC there, but `jq` and
`JSON.parse` do not. Never seed `.vscode` into `/home/project`, it blocks
`git clone <url> .` and collides with the cloned repo's own `.vscode`.

## Dead weight, so you do not mistake it for live code

The retired language-server images (`-no-ls`, `languageserver`, `theia-ls-setup`) are deleted.

Haskell, OCaml and Swift are deleted; every language in `images/` is in the build matrix.

## Build inputs and their integrity

Downloads outside the plugin list carry a pinned SHA-256 that the build checks
(Go, Maven, Stack, Bazelisk, rustup, the Artemis extension). Renovate bumps only
the version ARG, so update the sums with it; the build fails on a mismatch.
`artemis_extension_auto_update.yml` does this for the Artemis extension.

The `theiaPlugins` URLs in `images/base-ide/package.json.patch` (and the Artemis
URL written into the image's `package.json`) are fetched by Theia's
`download:plugins`, which has no checksum option, so they are pinned by version
only. Published GitHub release assets can be replaced by anyone with write
access; turn on immutable releases for the organization.

`decompress` 4.2.1 and `extract-zip` 2.0.1 in the Theia toolchain carry known
path traversal advisories and are already the latest releases, so there is no
version to move to. They only unpack the pinned plugin archives at build time.
Revisit when upstream ships a fix.

`images/README.md` still carries upstream Eclipse Theia text in its tutorial
half (the three-stage "ide-image / plugin-image / tool-image" description is
older than the current Dockerfiles). Its image table and publishing paragraph
match the build matrix, but the matrix stays the source of truth.

The scorpio pin in `images/base-ide/package.json.patch` was bumped by Renovate
(a regex `customManager` in `renovate.json` reading `EduIDE/scorpio` GitHub
releases). It replaced `scorpio_auto_update.yml`, which edited a file that does
not exist, so do not bring a dispatch-driven updater back.

`lerna.json` (`1.70.200`) and the root `package.json` (`1.70.201`) carry stale
version numbers. Neither is the EduIDE version (that comes from the release
tag) nor the Theia version (see `@theia/cli` in the ToolDockerfiles), and lerna
is only used for `lerna run`. Do not treat them as meaningful when you touch either.

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
2. Its `package.json.patch` and user settings, modelled on
   `images/java-17/theia/user-settings.json`
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
- Browser only: there is no Electron application, launcher or updater; do not add one.
- The language images copy `/home/theia` from the base without `node_modules` (`COPY --exclude=node_modules`): the backend is bundled into `applications/browser/lib`. Keep it that way, or the images grow by about 300 MB.
- Release tags are `vX.Y.Z`; the image tag is the same string without the `v`.
- Releases are manual: merge a release PR (CHANGELOG.md section), then run
  `gh workflow run release.yml -f version=X.Y.Z`. It drafts the GitHub
  Release, calls `build.yml` with `image_tag`, verifies the images and then
  publishes the release, which creates the tag. Nothing releases on a
  published Release, because one created with `GITHUB_TOKEN` triggers no
  workflow. Use the `release` skill (`.claude/skills/release/SKILL.md`).
- Every image stamps its own name, tag and commit into `EDUIDE_IMAGE_NAME` /
  `EDUIDE_IMAGE_TAG` / `EDUIDE_IMAGE_REVISION` at build time
  (`stamp-app-version: true` plus `IMAGE_NAME` and `IMAGE_REVISION` build args),
  and the About dialog reads them back through Theia's `EnvVariablesServer`.
  That is how a session says which image it is running.
  `docs/how-to-build-ide-variants.md`.
- Workflows must pass `actionlint`.
