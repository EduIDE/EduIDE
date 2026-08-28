# How to build IDE variants

This guide explains how to create new IDE image variants for specific programming languages. We'll use the C language variant as a concrete example throughout.

## Overview

All language-specific IDE variants build upon the reusable base IDE image (`base-ide`), which provides the core Eclipse Theia platform. Language variants extend this base with:

- Language-specific tools and compilers
- Theia/VSCode extensions for the language
- IDE configuration tailored to the language

## Step-by-Step Guide

### 1. Start with the Base Image

All language-specific variants start from the `base-ide` image, which is defined in `images/base-ide/BaseDockerfile`. This base image:

- Provides the core Eclipse Theia IDE platform
- Includes common extensions and plugins
- Sets up the basic runtime environment

In your variant's `ToolDockerfile`, you'll reference this base image:

```dockerfile
ARG BASE_IDE_TAG=latest
ARG BASE_IMAGE=ghcr.io/eduide/eduide/base:${BASE_IDE_TAG}
FROM ${BASE_IMAGE} AS base-ide
```

### 2. Create Subdirectory for Your Variant

Create a new subdirectory under `images/` with a descriptive name for your language variant. For example:

```
images/
  └── c/              # Your new variant directory
      ├── ToolDockerfile
      ├── package.json.patch
      └── project/
          └── .theia/
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
FROM node:22-bullseye AS plugin-image
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
FROM ubuntu:24.04 AS final-ide
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
- Define the entrypoint to launch Theia

**Example from C variant (lines 66-69):**

```dockerfile
RUN apt-get update && \
    apt-get install -y --no-install-recommends bash zsh curl gcc clang clangd git gdb make ca-certificates && \
    rm -rf /var/lib/apt/lists/*
```

This installs C/C++ development tools. Adapt this for your language's requirements.

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

### 5. Optionally Include .theia/settings.json

The `.theia/settings.json` file configures IDE behavior for users. It's placed in `images/{variant}/project/.theia/settings.json` and needs to get copied to `/home/project` in the final image.

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
          └── .theia/
              └── settings.json
```

This gets copied to `/home/project/.theia/settings.json` in the final image (see line 91 in C's `ToolDockerfile`).

## Complete Example Structure

Here's the complete file structure for the C variant:

```
images/c/
├── ToolDockerfile          # Multi-stage build for C IDE
├── package.json.patch      # C-specific extensions (clangd, MakefileTools)
└── project/
    └── .theia/
        └── settings.json   # IDE configuration (file exclusions, telemetry)
```

## Building Your Variant

Once you've created all the necessary files:

1. **Build the base image first** (if not already built):

   ```bash
   docker build -f images/base-ide/BaseDockerfile -t ghcr.io/eduide/eduide/base:latest .
   ```

2. **Build your language variant**:

   ```bash
   docker build -f images/c/ToolDockerfile -t ghcr.io/eduide/eduide/c:latest .
   ```

## Integrating into the Build Process

To have your new variant automatically built and pushed by GitHub Actions, add it to the build matrix in `.github/workflows/build.yml`.

### Add to Build Matrix

In the `build-and-push` job, add a new entry to the `matrix.include` array:

```yaml
build-and-push:
  needs:
    - determine-tag
    - build-and-push-base
  strategy:
    fail-fast: false
    matrix:
      include:
        # ... existing variants ...
        - docker-file: images/c/ToolDockerfile
          docker-context: "."
          image-name: ghcr.io/eduide/eduide/c
        # Add your new variant here:
        - docker-file: images/your-language/ToolDockerfile
          docker-context: "."
          image-name: ghcr.io/eduide/eduide/your-language
```

**Important fields:**

- `docker-file`: Path to your variant's `ToolDockerfile` relative to the repo root
- `docker-context`: Usually `"."` (repo root) to provide full context
- `image-name`: Docker image name following the pattern `ghcr.io/eduide/eduide/{variant-name}`

**Example for a new "go" variant:**

```yaml
- docker-file: images/go/ToolDockerfile
  docker-context: "."
  image-name: ghcr.io/eduide/eduide/go
```

### Build Process Flow

The workflow automatically:

1. Determines the appropriate tag (`pr-{number}`, release version, or `latest`)
2. Builds and pushes the base image first
3. Builds all variants in parallel using the matrix strategy
4. Passes `BASE_IDE_TAG` as a build argument so variants use the correct base image version

Once added, your variant will be built automatically on:

- Pull requests to `master`
- Pushes to `master`
- Releases
- Manual workflow dispatch

## Memory tuning

The Java variants cap all resident JVM and node processes so many environments fit on one host. See [java-image-memory-tuning.md](java-image-memory-tuning.md) before changing Gradle or language server settings in those images.

## Tips

- **Keep it minimal**: Only include tools and extensions actually needed for the language
- **Use specific versions**: Pin extension versions in `package.json.patch` for reproducibility
- **Test thoroughly**: Verify that language features (IntelliSense, debugging, etc.) work correctly
- **Check base excludes**: Review `images/base-ide/package.json.patch` to see what's already excluded
- **Follow existing patterns**: Look at other variants (Python, Java, Rust) for reference
