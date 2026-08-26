# AGENTS.md — EduIDE

The IDE itself, and the image factory that produces every variant students use.
A fork of Eclipse Theia's `theia-ide` blueprint, heavily reworked.

`CLAUDE.md` is a symlink to this file, so every agent reads the same thing.

## Layout

```
images/base-ide/BaseDockerfile      the base image every language image builds FROM
images/<lang>/ToolDockerfile        one per published image
applications/browser/               the Theia browser app
theia-extensions/product/           branding and product extension
scripts/                            build-time TypeScript and the package.json merge
docker-compose.images.yml           how to build and run every image locally
.github/workflows/build.yml         what CI publishes
docs/how-to-build-ide-variants.md   the fuller walkthrough; more current than this file
```

## What is actually published

Twelve images: `base`, plus eleven from the matrix in
`.github/workflows/build.yml` under the **`images`** job.

```
c  c-templates  haskell  java-17  java-17-templates
java-25  java-25-templates  javascript  ocaml  python  rust
```

Do not hardcode that list anywhere. EduIDE-Helm's release train reads it from
the matrix at run time, because a hand-kept copy went stale within days of
being written and a release nearly shipped pinning two tags that were never
built.

**Three families, and they are not the same shape.**

| Family | Has | Entrypoint |
|---|---|---|
| plain (`c`, `java-17`, `python`, …) | a `package.json.patch` and its own VS Code settings file | Theia's `main.js` |
| `-templates` | `templates/<flavour>/`, `entrypoint.sh`. **No** `package.json.patch`, **no** `project/`. Plugins inherited from the language image | `entrypoint.sh`, which copies `$TEMPLATE` into `/home/project` |
| base | the plugin set everything else inherits | — |

## Traps

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
   (omit both for a `-templates` image; add `templates/` and `entrypoint.sh`)
3. A service in `docker-compose.images.yml` on the next free port
4. A matrix entry under the **`images`** job in `.github/workflows/build.yml`

Then add it to `appDefinitions.apps` in EduIDE-Helm's `eduide` chart, which is
what actually offers it to students. Building an image deploys nothing:
`haskell`, `java-25` and `java-25-templates` are all published today and no
environment offers any of them.

`docs/how-to-build-ide-variants.md` is the longer version and is current.

## Conventions

- The `theia` user is uid 101 in every image.
- Electron code is deleted during the base build; do not add to it.
- Release tags are `vX.Y.Z`; the image tag is the same string without the `v`.
- Workflows must pass `actionlint`.
