<div align="center">
    <img src="docs/images/eduide-logo.png" alt="EduIDE" width="140"/>
    <h1>EduIDE</h1>
    <p><strong>A full IDE in the browser, pre-configured for the course a student is actually taking.</strong></p>
</div>

---

Students open a link and get a real IDE - compiler, language server, debugger,
terminal, linting and editor settings already set up for their language. Nothing
to install, nothing to configure, and every student gets the identical
environment, so "it works on my machine" stops being a thing anyone has to
debug.

Instructors pick the matching image when creating a programming exercise in
[Artemis](https://github.com/ls1intum/Artemis). EduIDE does the rest.

It is built on [Eclipse Theia](https://theia-ide.org/), and it is a real IDE
rather than a text box in a web page:

<div align="center">
  <img src="docs/images/eduide-editor.png" alt="EduIDE editing and running a Java program" width="820"/>
</div>

<div align="center">
  <img src="docs/images/eduide-welcome.png" alt="The EduIDE welcome screen" width="820"/>
</div>

## Try it in one command

Any published image runs standalone. No Kubernetes, no Artemis, no account:

```sh
docker run --rm -p 3000:3000 ghcr.io/eduide/eduide/java-17-standalone:latest
```

Open <http://127.0.0.1:3000/>. The screenshot above is that container.

Every language comes in two **editions**, published to `ghcr.io/eduide/eduide/<language>-<edition>`:

- `-artemis`: with the Artemis extension (Iris), for exercises launched from Artemis.
- `-standalone`: without it, and with an expiring git credential cache (three hours).

Both carry Scorpio and the data bridge, the same toolchain and the same templates.

| Language | Artemis | Standalone |
| --- | --- | --- |
| Java 17 | `java-17-artemis` | `java-17-standalone` |
| Java 25 | `java-25-artemis` | `java-25-standalone` |
| Python | `python-artemis` | `python-standalone` |
| JavaScript | `javascript-artemis` | `javascript-standalone` |
| C | `c-artemis` | `c-standalone` |
| Rust | `rust-artemis` | `rust-standalone` |
| Go | `go-artemis` | `go-standalone` |

`ocaml` and `haskell` are no longer published; build them locally with
`docker compose -f docker-compose.images.yml build <name>`.

There are no per-university images any more. A university with its own needs
builds its own image `FROM` an edition image, see
[Building an IDE variant](docs/how-to-build-ide-variants.md); the
planned Mannheim image (`EduIDE/EduIDE-image-mannheim`, not created yet) will be the example.

## Documentation

| | |
| --- | --- |
| [Documentation site](https://eduide.github.io/Docs/) | Everything, start here |
| [Running EduIDE for your university](https://eduide.github.io/Docs/admins/intro) | Installing it on a Kubernetes cluster |
| [Developer guide](https://eduide.github.io/Docs/developer/intro) | Architecture and how the pieces fit |
| [Building an IDE variant](docs/how-to-build-ide-variants.md) | Adding a language, in detail |

## How it fits together

This repository is the IDE and the images. Running it as a service for a whole
university takes three more:

| Repository | |
| --- | --- |
| **EduIDE** (here) | The Theia-based IDE and every language image |
| [EduIDE-Cloud](https://github.com/EduIDE/EduIDE-Cloud) | The operator and REST service that start and stop sessions |
| [EduIDE-Landing-Page](https://github.com/EduIDE/EduIDE-Landing-Page) | Where students pick an environment |
| [EduIDE-Helm](https://github.com/EduIDE/EduIDE-Helm) | The Helm charts that install all of it |

Every image is a **layered build**: `base` compiles Theia from source once,
`base-standalone` and `base-artemis` are thin editions of it, and each language
image starts from one of the two and adds its toolchain and its VS Code
extensions from [Open VSX](https://open-vsx.org/). Adding a language never
rebuilds the IDE.

## Contributing

Contributions are welcome, including from outside TUM.

Build and run everything locally with Docker Compose. The base image builds
first; language images pick it up automatically:

```sh
docker compose -f docker-compose.images.yml build java-17-standalone
docker compose -f docker-compose.images.yml up java-17-standalone     # http://127.0.0.1:3103/
```

Each language has a host port; see `docker-compose.images.yml`.

**Adding a language** takes: one edition-agnostic `images/<lang>/ToolDockerfile`,
a `package.json.patch` listing only the plugin overrides, a `templates/`
folder, two services in `docker-compose.images.yml` (one per edition) and two
matrix entries in `.github/workflows/build.yml`. Test an image with
`scripts/smoke-test-image.sh <image> <standalone|artemis>`. Copy `images/java-17` as the starting point -
[the full walkthrough is here](docs/how-to-build-ide-variants.md).

Building an image does not offer it to anyone. It also needs an entry in
`appDefinitions.apps` in the `eduide` chart in
[EduIDE-Helm](https://github.com/EduIDE/EduIDE-Helm), which is what puts it on
the landing page and preloads it onto the cluster's nodes.

**Updating Theia** touches every `@theia/*` package at once:

```sh
yarn update:theia 1.69.0
```

CI builds `base` first, then the two editions, and threads the immutable tag into every language
build, so a pull request can never test against a base image that has since
moved. PRs publish `pr-<number>` tags you can pull and try.

## License

[MIT](LICENSE). "Theia" is a trademark of the Eclipse Foundation -
<https://www.eclipse.org/theia>.

This project is a fork of [Eclipse Theia IDE](https://github.com/eclipse-theia/theia-ide),
tailored for computer science education.
