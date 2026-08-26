<br/>
<div id="theia-logo" align="center">
    <br />
    <img src="https://raw.githubusercontent.com/eclipse-theia/theia-ide/master/theia-extensions/product/src/browser/icons/TheiaIDE.png" alt="Theia Logo" width="300"/>
    <h3>EduIDE</h3>
</div>

<div id="badges" align="center">

EduIDE is built with this project.\
This repository is a fork of the Eclipse Theia IDE project, tailored for computer science education.

</div>

[Main Theia Repository](https://github.com/eclipse-theia/theia) — [Eclipse Theia IDE Repository](https://github.com/eclipse-theia/theia-ide)

---

## What is EduIDE?

EduIDE provides **browser-based, language-specific IDE environments** for higher education. Students open a full IDE in their browser — no local installation required — pre-configured with the compiler, language server, linter, and editor settings appropriate for their course.

Instructors select a matching image in [Artemis](https://github.com/ls1intum/Artemis) when creating a programming exercise. EduIDE handles the rest.

### Available images

| Language | Image | Language server & autocomplete |
| --- | --- | :---: |
| Java 17 | `ghcr.io/eduide/eduide/java-17` | ✔️ |
| Java 25 | `ghcr.io/eduide/eduide/java-25` | ✔️ |
| Python | `ghcr.io/eduide/eduide/python` | ✔️ |
| C | `ghcr.io/eduide/eduide/c` | ✔️ |
| JavaScript | `ghcr.io/eduide/eduide/javascript` | ✔️ |
| Rust | `ghcr.io/eduide/eduide/rust` | ✔️ |
| Swift | `ghcr.io/eduide/eduide/swift` | ✔️ |
| OCaml | `ghcr.io/eduide/eduide/ocaml` | ✔️ |
| Haskell | `ghcr.io/eduide/eduide/haskell` | ❌ |

### Architecture overview

All images share a common **two-tier build**:

1. **`base-ide`** — Compiles the Theia application from source, downloads core plugins (Git, Markdown, Scorpio/Artemis integration), and produces a slim runtime layer.
2. **Language images** — Each starts from the `base-ide` layer, adds a language compiler/runtime (via apt), and downloads language-specific VS Code extensions from [Open VSX](https://open-vsx.org/).

This means Theia is only built once. Adding or updating a language image does not require rebuilding the IDE.

## Running locally

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with BuildKit enabled (Docker Desktop 4.x or Docker Engine 23+)
- [Docker Compose](https://docs.docker.com/compose/) v2.x

### Option A — Run a pre-built image

Pull and run any language image directly:

```sh
docker run --rm -p 3000:3000 ghcr.io/eduide/eduide/java-17:latest
```

Then open <http://localhost:3000/> in your browser.

### Option B — Build and run locally with Docker Compose

The repository includes `docker-compose.images.yml` which builds all images and wires them together. Language images automatically consume the locally-built `base-ide` via `additional_contexts`.

**Build everything** (base first, then all language images in parallel):

```sh
docker compose -f docker-compose.images.yml build
```

**Build a single language image** (base is rebuilt or reused from cache):

```sh
docker compose -f docker-compose.images.yml build java-17
```

**Start a specific IDE** and open it in the browser:

```sh
docker compose -f docker-compose.images.yml up java-17
# → http://localhost:3003/
```

Port mapping per service:

| Service | Host port | URL |
| --- | --- | --- |
| `base-ide` | 3000 | <http://localhost:3000/> |
| `c` | 3001 | <http://localhost:3001/> |
| `haskell` | 3002 | <http://localhost:3002/> |
| `java-17` | 3003 | <http://localhost:3003/> |
| `java-25` | 3011 | <http://localhost:3011/> |
| `javascript` | 3004 | <http://localhost:3004/> |
| `ocaml` | 3005 | <http://localhost:3005/> |
| `python` | 3006 | <http://localhost:3006/> |
| `rust` | 3007 | <http://localhost:3007/> |
| `swift` | 3008 | <http://localhost:3008/> |

---

## Contributing

### Repository structure

```text
images/
  base-ide/          # Builds Theia from source (BaseDockerfile)
  <lang>/            # One directory per language (ToolDockerfile)
    ToolDockerfile
    package.json.patch              # Plugin overrides merged on top of root package.json
    project/.vscode/settings.json  # Workspace settings loaded by Theia on startup
applications/browser/        # Browser target (compiled into base-ide)
theia-extensions/product/    # Custom branding extension (included in all images)
scripts/                     # Utility scripts (update-theia-version, make-files-writeable)
docker-compose.images.yml    # Local build and run
.github/workflows/build.yml  # CI: builds and pushes all images to GHCR
```

### Adding a new language image

1. **Create `images/<lang>/`** with three files:

   **`ToolDockerfile`** — copy `images/c/ToolDockerfile` as a starting point and replace the apt packages and plugin download step with your language's tooling.

   **`package.json.patch`** — declare only the plugin overrides. The file is deep-merged with the root `package.json` at build time:

   ```json
   {
     "theiaPlugins": {
       "my-publisher.my-extension": "https://open-vsx.org/api/my-publisher/my-extension/1.0.0/file/..."
     },
     "theiaPluginsExcludeIds": [
       "vscode.php"
     ]
   }
   ```

   Browse plugins at [open-vsx.org](https://open-vsx.org/).

   **`project/.vscode/settings.json`** — workspace settings Theia loads on startup. At minimum include:

   ```json
   {
     "extensions.ignoreRecommendations": true,
     "files.exclude": { "**/.theia": true, "persisted": true, "lost+found": true },
     "telemetry.telemetryLevel": false
   }
   ```

2. **Add the service to `docker-compose.images.yml`** following the existing pattern (include `additional_contexts` so local builds use the locally-built base):

   ```yaml
   <lang>:
     image: theia-<lang>:local
     build:
       context: .
       dockerfile: images/<lang>/ToolDockerfile
       args:
         BASE_IMAGE: theia-base:local
       additional_contexts:
         base-ide: "service:base-ide"
     depends_on:
       - base-ide
     ports:
       - "30XX:3000"
   ```

3. **Add a matrix entry to `.github/workflows/build.yml`** under the `build-and-push` job so CI publishes the image.

4. **Test locally** before opening a PR:

   ```sh
   docker compose -f docker-compose.images.yml build <lang>
   docker compose -f docker-compose.images.yml up <lang>
   # open http://localhost:30XX/ and verify the IDE starts and the language tools work
   ```

### Updating the Theia version

All `@theia/*` packages must stay in sync. Use the provided script:

```sh
yarn update:theia <new-version>
# example:
yarn update:theia 1.69.0
```

Then rebuild and test locally before pushing.

### CI / CD

The GitHub Actions workflow (`.github/workflows/build.yml`) runs on every pull request, push to `main`, and release:

- **PRs** produce images tagged `pr-<number>` and `pr-<number>-<sha>` — useful for review testing.
- **`main`** produces `latest` and `latest-<sha>`.
- **Releases** produce a semver tag and a SHA-tagged variant.

The `base-ide` image is always built first. All language images are built in parallel afterwards, receiving `BASE_IDE_TAG` as a build argument so they pull the matching base.

Arm64 builds are included for all events except PRs (to keep PR feedback fast).

---

## License

[MIT](LICENSE)

## Trademark

"Theia" is a trademark of the Eclipse Foundation — <https://www.eclipse.org/theia>
