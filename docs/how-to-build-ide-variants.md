# How to build IDE variants

This guide explains how to create new IDE image variants for specific programming languages. We'll use the C language variant as a concrete example throughout.

## Overview

All language-specific IDE variants build upon the reusable base IDE image (`base-ide`), which provides the core Eclipse Theia platform. There is **one `ToolDockerfile` per language**, and it is edition-agnostic: CI builds it twice, once on `base-standalone` and once on `base-artemis` (see [Editions](#editions)). Language variants extend the base with:

- Language-specific tools and compilers
- Theia/VSCode extensions for the language
- IDE configuration tailored to the language

## Step-by-Step Guide

### 1. Start with the Base Image

All language-specific variants start from an edition of the base image. `base` is defined in `images/base-ide/BaseDockerfile`. It:

- Provides the core Eclipse Theia IDE platform
- Includes the extensions EduIDE itself needs (`theia-cloud-monitor`, `scorpio`, `data-bridge`) and common editing aids (Code Spell Checker with the German dictionary, Error Lens, EditorConfig)
- Sets up the basic runtime environment

In your variant's `ToolDockerfile`, you'll reference the base image. CI passes `BASE_IMAGE` pointing at `base-standalone` or `base-artemis`; the default only serves local builds:

```dockerfile
ARG BASE_IDE_TAG=latest
ARG BASE_IMAGE=ghcr.io/eduide/eduide/base:${BASE_IDE_TAG}
FROM ${BASE_IMAGE} AS base-ide
```

#### Editions

| Image | Built from | Adds |
|---|---|---|
| `base` | `images/base-ide/BaseDockerfile` | Theia, Scorpio, data bridge, `theia-cloud-monitor`; no Artemis extension |
| `base-standalone` | `images/base-standalone/Dockerfile` | git credential cache, `cache --timeout=10800` |
| `base-artemis` | `images/base-artemis/Dockerfile` | `artemis-extension`, in `plugins/` and in `package.json` `theiaPlugins` (the language images' plugin sync prunes everything not listed there) |

Never put edition specifics into a `ToolDockerfile`. The published names are `<lang>-standalone` and `<lang>-artemis`.

### 2. Create Subdirectory for Your Variant

Create a new subdirectory under `images/` with a descriptive name for your language variant. For example:

```
images/
  └── c/              # Your new variant directory
      ├── ToolDockerfile
      ├── package.json.patch
      ├── templates/      # project templates, see "Project templates"
      └── project/
          └── .vscode/
              └── settings.json
```

The directory name should be clear and concise (e.g., `c`, `python`, `java-17`, `rust`).

### 3. Create ToolDockerfile

The `ToolDockerfile` defines how your language-specific variant is built. Using the C variant as an example, here are the key phases:

#### Phase 1: Base Image Reference

```dockerfile
FROM ${BASE_IMAGE} AS base-ide
```

This stage loads the base IDE image that all variants share.

#### Phase 2: Plugin Image Stage

```dockerfile
FROM node:22-trixie AS plugin-image
```

A temporary stage to download and prepare language-specific plugins/extensions.

**Key steps in this phase:**

- Install `jq` for JSON merging
- Copy the base `package.json` and your variant's `package.json.patch`
- Merge them using `jq` to create the final `package.json` with language-specific plugins
- Copy necessary scripts and configs from the base image
- Run `yarn download:plugins` to fetch the language-specific extensions

#### Phase 3: Final IDE Assembly

```dockerfile
FROM ubuntu:26.04 AS final-ide
```

The final runtime image that combines everything.

**Key steps:**

- Copy Node.js runtime from the plugin-image (required for Theia)
- Install system dependencies and language-specific tools (e.g., `gcc`, `clang`, `clangd` for C)
- Create the `theia` user and set up directory permissions
- Copy the built application from `base-ide`
- Copy additional plugins from `plugin-image`
- Optionally install shell enhancements (Oh My Zsh, plugins)
- Copy project settings (including `.theia/settings.json`)
- Set environment variables (`SHELL`, `THEIA_DEFAULT_PLUGINS`, `USE_LOCAL_GIT`)
- Stamp the image coordinates (`EDUIDE_IMAGE_NAME`, `EDUIDE_IMAGE_TAG`, `EDUIDE_IMAGE_REVISION`), see [Image version stamp](#image-version-stamp)
- Copy `images/<lang>/templates` to `/home/theia/templates`
- Run `scripts/check-required-plugins.sh` last: it fails the build if a patch nulled `theia-cloud-monitor`, `scorpio` or `data-bridge`
- Start `node .../main.js` directly as the entrypoint (the C image keeps a small `entrypoint.sh` that only writes the Bazel remote cache config)

**Example from C variant (lines 66-69):**

```dockerfile
RUN apt-get update && \
    apt-get install -y --no-install-recommends bash zsh curl gcc clang clangd git gdb make ca-certificates && \
    rm -rf /var/lib/apt/lists/*
```

This installs C/C++ development tools. Adapt this for your language's requirements. Every language image also carries `git`, `openssh-client`, `curl`, `ca-certificates`, `bash`, `zsh`, `less`, `nano` and `unzip`. Tools that do not come from apt are pinned with an `ARG <NAME>_VERSION` preceded by a `# renovate: datasource=... depName=...` comment; a regex manager in `renovate.json` proposes the bumps.

### 4. Create package.json.patch

The `package.json.patch` file extends the base `package.json` with language-specific Theia/VSCode extensions. It uses JSON merge semantics, so you only need to specify the fields you want to add or override.

**Note**: Depending on `jq` usage, nested fields are not merged, but replaced if overridden through the patch file.

#### theiaPlugins Field

This field specifies additional Theia and VSCode extensions to include. Each entry maps an extension ID to its VSIX download URL (typically from Open VSX or GitHub releases).

**Example from C variant:**

```json
{
  "theiaPlugins": {
    "eclipse-theia.builtin-extension-pack": "https://open-vsx.org/api/eclipse-theia/builtin-extension-pack/1.88.1/file/eclipse-theia.builtin-extension-pack-1.88.1.vsix",
    "MakefileTools": "https://open-vsx.org/api/ms-vscode/makefile-tools/0.9.10/file/ms-vscode.makefile-tools-0.9.10.vsix",
    "clangd": "https://open-vsx.org/api/llvm-vs-code-extensions/vscode-clangd/0.1.29/file/llvm-vs-code-extensions.vscode-clangd-0.1.29.vsix"
  }
}
```

- `eclipse-theia.builtin-extension-pack`: Core Theia extensions
- `MakefileTools`: VSCode extension for Makefile support
- `clangd`: Language server for C/C++ providing IntelliSense, diagnostics, etc.

**Finding extensions:**

- Browse [Open VSX Registry](https://open-vsx.org/) for VSCode extensions
- Use the VSIX file URL format: `https://open-vsx.org/api/{publisher}/{extension}/{version}/file/{extension}-{version}.vsix`

#### theiaPluginsExcludeIds Field

This array lists extension IDs to exclude from the base image. This is useful when:

- The base image includes extensions you don't need for this language
- You want to reduce image size by removing unused language/ feature support
- You're replacing a base extension with a language-specific version

**Example from C variant:**

```json
{
  "theiaPluginsExcludeIds": [
    "vscode.python",
    "vscode.java",
    "vscode.typescript",
    "vscode.typescript-language-features",
    // ... many more
  ]
}
```

The C variant excludes Python, Java, TypeScript, and many other language extensions since they're not needed for C development.

**Note**: The list of excluded ids is best established by building and checking an image with an empty exclude list. There, you can see the extension browser to review all images.

### 5. Optionally Include .vscode/settings.json

The `.vscode/settings.json` file configures IDE behavior for users. It's placed in `images/{variant}/project/.vscode/settings.json` and needs to get copied to `/home/project` in the final image. Set `cSpell.language` to `en,de` and the default formatter of your language here if its extension is in the image.

**Example from C variant:**

```json
{
    "extensions.ignoreRecommendations": true,
    "files.exclude": {
        "**/.theia": true,
        "persisted": true,
        "lost+found": true
    },
    "telemetry.telemetryLevel": false
}
```

**Common settings:**

- `files.exclude`: Hide files/directories from the file explorer
- `extensions.ignoreRecommendations`: Disable extension recommendations
- `telemetry.telemetryLevel`: Control telemetry collection
- Language-specific settings (e.g., `clangd.path`, `python.defaultInterpreterPath`)

**File structure:**

```
images/
  └── c/
      └── project/
          └── .vscode/
              └── settings.json
```

This gets copied to `/home/project/.vscode/settings.json` in the final image.

## Complete Example Structure

Here's the complete file structure for the C variant:

```
images/c/
├── ToolDockerfile          # Multi-stage build for C IDE
├── package.json.patch      # C-specific extensions (clangd, MakefileTools)
├── entrypoint.sh           # Bazel remote cache config, then starts Theia
├── templates/              # make/, bazel/, each with a template.json
└── project/
    └── .vscode/
        └── settings.json   # IDE configuration (file exclusions, telemetry)
```

## Project templates

Templates live in `images/<lang>/templates/<id>/`; the folder name is the id. Each has a `template.json`:

```json
{ "label": "Maven", "description": "Java project built with Maven, JUnit 5", "order": 1 }
```

A folder without one is ignored. The image copies them to `/home/theia/templates/<id>/`; Scorpio copies the one named in `TEMPLATE` into an empty workspace.

Rules: the template runs offline with the toolchain in the image, has one small program and one passing test, and has `.vscode/tasks.json` with Run (default build task), Build where the language has one, and a Test task (`"group": "test"`), plus `launch.json`, `settings.json`, `.gitignore`, neutral names and no university branding. The smoke test runs the Test task of every template; a template without one is skipped.

**Adding a template:**

1. Add `images/<lang>/templates/<id>/` with `template.json`.
2. The smoke test picks it up.
3. Offer it by adding `{ id, label }` to the app's `buildSystems` in the EduIDE-Helm catalog. CI publishes each image's template list as the build artifact `templates-<image>.json`, which the release train checks against the catalog.
4. Update the template table in the docs.

## Building Your Variant

Once you've created all the necessary files:

1. **Build the base image first** (if not already built):

   ```bash
   docker build -f images/base-ide/BaseDockerfile -t ghcr.io/eduide/eduide/base:latest .
   ```

2. **Build the editions**:

   ```bash
   docker build -f images/base-standalone/Dockerfile -t ghcr.io/eduide/eduide/base-standalone:latest .
   docker build -f images/base-artemis/Dockerfile -t ghcr.io/eduide/eduide/base-artemis:latest .
   ```

3. **Build your language variant** once per edition:

   ```bash
   docker build -f images/c/ToolDockerfile --build-arg BASE_IMAGE=ghcr.io/eduide/eduide/base-standalone:latest -t eduide-c-standalone:local .
   docker build -f images/c/ToolDockerfile --build-arg BASE_IMAGE=ghcr.io/eduide/eduide/base-artemis:latest -t eduide-c-artemis:local .
   ```

4. **Smoke test it**:

   ```bash
   scripts/smoke-test-image.sh eduide-c-standalone:local standalone
   ```

   It checks that the IDE answers on :3000, that the required extensions are present (the Artemis extension only in the artemis edition), that the credential cache is set only in standalone, that the toolchain runs, and that every template's Test task passes with `--network none`. It also writes `templates-<image>.json`. The real Artemis flow (autoclone, Iris) is not covered; check it by hand on staging.

## Integrating into the Build Process

To have your new variant automatically built and pushed by GitHub Actions, add it to the build matrix in `.github/workflows/build.yml`.

### Add to Build Matrix

Add two entries (one per edition) to `jobs.images.strategy.matrix.include`, and the language to the `smoke` job's `language` list:

```yaml
- image-name: eduide/eduide/go-standalone
  docker-file: images/go/ToolDockerfile
  edition: standalone
- image-name: eduide/eduide/go-artemis
  docker-file: images/go/ToolDockerfile
  edition: artemis
```

**Important fields:**

- `image-name`: `eduide/eduide/<lang>-<edition>`. EduIDE-Helm's release train reads this key from the matrix, so keep the job named `images` and the entries flat.
- `docker-file`: the same `ToolDockerfile` for both entries.
- `edition`: selects `base-standalone` or `base-artemis` as `BASE_IMAGE`.

### Build Process Flow

The workflow automatically:

1. Determines the appropriate tag (`pr-{number}`, release version, or `latest`)
2. Builds and pushes the base image first, then `base-standalone` and `base-artemis`
3. Builds all variants in parallel using the matrix strategy
4. Passes the immutable sha tag of the base in `BASE_IMAGE`, so variants use the correct base image version
5. Pulls every built image and runs `scripts/smoke-test-image.sh` on it; a failing smoke test fails the PR

Once added, your variant will be built automatically on:

- Pull requests to `main`
- Pushes to `main`
- Releases
- Manual workflow dispatch

## Image version stamp

Every published image carries its own coordinates, so a running session can say
which image it came from. This is what the "Version" section of the About dialog
shows, and it is the only way to tell a stale deployment from a current one from
inside the IDE.

Each `ToolDockerfile` ends its final stage with:

```dockerfile
ARG APP_VERSION=""
ARG IMAGE_NAME=""
ARG IMAGE_REVISION=""
ENV EDUIDE_IMAGE_NAME=${IMAGE_NAME} \
    EDUIDE_IMAGE_TAG=${APP_VERSION} \
    EDUIDE_IMAGE_REVISION=${IMAGE_REVISION}
```

`IMAGE_NAME` comes from the matrix entry in `.github/workflows/build.yml`, so it
cannot drift from the name the image is actually pushed under. `APP_VERSION` is
supplied by the shared build workflow's `stamp-app-version: true` input, which
appends the tag it derived for this build - `latest`, `pr-<N>`, `<branch-slug>`
or the release version with the leading `v` already stripped. That is the same
string the image is tagged with, derived once in the shared workflow, so the
value inside the image and the tag outside it cannot disagree.

`IMAGE_REVISION` is `github.sha`. A tag on its own cannot always answer "is this
the current build": every push to main publishes `latest`, so a container that
has been running for a month reports the same tag as the image published an hour
ago. The commit separates them, and its first seven characters are also the
suffix of the immutable `<tag>-<short-sha>` tag the same build publishes, so the
About dialog gives you something you can pin. On a pull request `github.sha` is
GitHub's ephemeral merge commit rather than a commit on the branch, so the
revision will not resolve in `git log`. It still matches the published
`pr-<N>-<short-sha>` tag, which is what it is there for.

Place the block as the last instruction before `ENTRYPOINT`. The tag changes on
every branch and pull request, so an earlier position would invalidate the layer
cache for everything below it.

A hand-built image (`docker build` without `--build-arg APP_VERSION=...`, which
includes every `docker-compose.images.yml` build) leaves the variables empty; the
About dialog then shows `unknown` and omits the revision line. The frontend just
reads the environment at runtime, so a deployment can override the variables
without rebuilding.

## Deriving an installation image

A university that needs more than an edition offers (a build tool, an extension, settings, keymaps) does not fork this repository. It builds its own image `FROM` an edition image in its own repository:

```dockerfile
ARG EDUIDE_VERSION=2.0.0
FROM ghcr.io/eduide/eduide/java-25-standalone:${EDUIDE_VERSION}
USER root
# installation specifics: packages, extensions into /home/theia/plugins, settings
USER theia
```

Tag the result with the EduIDE version (`2.0.0`), with a `-N` suffix for changes that are only yours (`2.0.0-1`), and let Renovate bump `EDUIDE_VERSION`. Reference it in the Helm values with a full path and tag, since the chart prefixes `imageRegistry` to any image without a tag.

[EduIDE/EduIDE-image-mannheim](https://github.com/EduIDE/EduIDE-image-mannheim) is the reference example (Mannheim's Maven from apt, Live Preview, settings and keymaps on top of `java-25-standalone`) and a GitHub template repository to start from.

## Memory tuning

The Java variants cap all resident JVM and node processes so many environments fit on one host. See [java-image-memory-tuning.md](java-image-memory-tuning.md) before changing Gradle or language server settings in those images.

## Tips

- **Keep it minimal**: Only include tools and extensions actually needed for the language
- **Use specific versions**: Pin extension versions in `package.json.patch` for reproducibility
- **Test thoroughly**: Verify that language features (IntelliSense, debugging, etc.) work correctly
- **Check base excludes**: Review `images/base-ide/package.json.patch` to see what's already excluded
- **Follow existing patterns**: Look at other variants (Python, Java, Rust) for reference
