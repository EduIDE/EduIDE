# Changelog

Release notes of the EduIDE images. `release.yml` copies the section of a version into its GitHub Release, see `.claude/skills/release/SKILL.md`.

## [Unreleased]

## [3.0.1] - 2026-11-23

### Changes

- New workspaces start empty, so `git clone <url> .` works, and a repository's or template's own `.vscode/settings.json` now wins over the image defaults. The image settings moved out of the workspace: shared ones into the Theia preferences defaults, language specific ones into `/home/theia/.theia-ide/settings.json`. Existing workspaces keep their old `/home/project/.vscode/settings.json`, students can delete it ([#250](https://github.com/EduIDE/EduIDE/pull/250))

### Dependencies

- scorpio 3.3.0 -> 3.4.0: Clone Repository button in Source Control that clones into the workspace root ([release](https://github.com/EduIDE/scorpio/releases/tag/v3.4.0))

### Fixes

- A session needs about 100 to 300 MB less memory, depending on the language: the file watcher runs in the server process (`--no-cluster`), every image limits glibc to two malloc arenas (`MALLOC_ARENA_MAX=2`), the spell checker is off by default (turn it on with `"cSpell.enabled": true`), and the Go image turns gopls telemetry off ([docs/ide-memory-tuning.md](docs/ide-memory-tuning.md), [#248](https://github.com/EduIDE/EduIDE/pull/248))

## [3.0.0] - 2026-11-23

### Breaking changes

- The images run with the Go control plane (EduIDE-control-plane) only: the base image ships the `eduide-session` extension (built from EduIDE-control-plane v0.2.3) instead of the data bridge and `theia-cloud-monitor`, and webviews and the HTML preview use the fixed host `webview.{{hostname}}` (`THEIA_WEBVIEW_EXTERNAL_ENDPOINT`, `THEIA_MINI_BROWSER_HOST_PATTERN`) instead of `{{uuid}}.webview.{{hostname}}`. Scorpio 3.3.0 looks up `eduide.eduide-session`. The browser input reporting of the customization extension is removed, `eduide-session` sends the heartbeats
- Every language comes in two editions instead of per-university images: `ghcr.io/eduide/eduide/<lang>-artemis` (with the Artemis extension) and `<lang>-standalone` (git credentials cached in memory for 3 hours), both on Ubuntu 26.04. The images `java-17`, `java-25`, `python`, `javascript`, `c`, the `*-templates` images and `thm-java-25` get no new tags. Installation-specific images derive FROM an edition image (template repository EduIDE/EduIDE-image-mannheim) ([#221](https://github.com/EduIDE/EduIDE/pull/221))
- Live Preview is removed; HTML preview uses Theia's mini browser ("Open Preview to the Side") ([#221](https://github.com/EduIDE/EduIDE/pull/221))

### Features

- Every language image writes `/opt/eduide/template.json` (variants, installed tool and extension versions, image version) and carries it as the OCI index annotation `io.eduide.template` for the Go control plane
- File > Back to Start Page returns to the installation's landing page and replaces Close Workspace, which only left an empty IDE. The session keeps running
- Rust is back and Go is new, with starter templates for Python, Node (TypeScript), Web (TypeScript), Cargo and Go next to the Java and C ones. Scorpio applies a template from `/home/theia/templates` when a session starts without a repository ([#222](https://github.com/EduIDE/EduIDE/pull/222))
- Spell checker (English, German), Error Lens and EditorConfig in every image; the Python images ship numpy, pandas, matplotlib, uv and ruff, and Ruff formats Python on save ([#221](https://github.com/EduIDE/EduIDE/pull/221))
- Experience levels apply to every language and take effect immediately; the status bar shows "Temporary workspace" or "Saved workspace" ([#220](https://github.com/EduIDE/EduIDE/pull/220))
- The Explorer is open when a session starts, and a little wider (24% of the window instead of 19.1%), so students see their files without opening it by hand; a layout the student arranged is kept on reload
- Browser input now counts as session activity, so a session that is in use is not stopped as idle ([#218](https://github.com/EduIDE/EduIDE/pull/218))

### Fixes

- The Artemis edition sets `DATA_BRIDGE_ENABLED=true` in every language image, so the Artemis extension fetches its login from `eduide-session` (the Go control plane does not set it per session like the Java operator did)
- Git trusts `/home/project` (system `safe.directory`), so cloning into a workspace volume root owned by root no longer fails with "dubious ownership"
- The browser tab and window title name the application EduIDE ([#219](https://github.com/EduIDE/EduIDE/pull/219))
- The Welcome page no longer offers `Open Version Control` and `Open new Terminal` while the Beginner level (or an override) turns Source Control and the terminal off ([#229](https://github.com/EduIDE/EduIDE/pull/229))
- The Welcome page stays centered and no longer cuts off its right column next to the open Explorer
- EduIDE Light is readable: search match highlights, buttons, menu selection and the focus border use a darker teal with at least 4.5:1 contrast instead of the dark theme's accent colors; the side panel, activity bar and tabs are set apart from the editor by borders and darker grays, and inactive activity bar icons and UI text are darker
- C sessions with a Makefile no longer open with the Makefile Tools "Configuring project ... Do you want to continue?" dialog, which swallowed the student's first action; the images and the Make template turn off `makefile.configureOnOpen`, `makefile.configureOnEdit` and `makefile.configureAfterCommand` (clangd provides IntelliSense and does not use that configure)

### Changes

- Smaller images: the language images no longer copy `/home/theia/node_modules` (about 300 MB; the backend is bundled into `applications/browser/lib`), and `java-25` uses the universal `redhat.java` 1.58.0 without its embedded JRE (about 134 MB; the language server runs on the image's JDK 25). `java-25` also moves from a `redhat.java` nightly to that stable release
- Browser only: the Electron application, the launcher and updater extensions and the Electron code of the product extension are removed, as are `@theia/plugin-dev` and `@theia/metrics` (243 npm packages fewer in `yarn.lock`)
- The unpublished Haskell, OCaml and Swift images, the old Theia IDE logo and an orphaned template file are removed
- The Artemis edition sets `GRADLE_PREWARM_AUTO_CONFIRM=true` (Java images and the base), so scorpio starts the Gradle prewarm without a prompt; standalone editions keep the prompt

### Security

- The unpublished `swift` image binds the IDE to `127.0.0.1` like the published ones, and the retired `-no-ls`, `languageserver` and `theia-ls-setup` directories are removed
- Downloads of rustup, Bazelisk and the Artemis extension are checked against pinned SHA-256 sums; the Python packages and the `alpine/git` stage are pinned to versions. The Artemis extension is no longer re-downloaded without the checksum in the language images. Plugin vsix downloads from `package.json` remain pinned by version only
- The local compose file publishes its ports on `127.0.0.1` only
- A manual run of the image build refuses version tags (`1.2.3`, `1.2.3-rc.1`); only the release workflow publishes those

### Dependencies

- **Security:** Artemis extension 1.2.9: a `.vscode/settings.json` in an opened repository can no longer set the Artemis server URL and so receive the student's Artemis login ([#244](https://github.com/EduIDE/EduIDE/pull/244)); 1.2.7 before it loads the exercise description in EduIDE sessions started from Artemis ([#243](https://github.com/EduIDE/EduIDE/pull/243))
- `eduide-session` built from EduIDE-control-plane v0.2.3 (the extension is unchanged since v0.2.0) and Scorpio 3.3.0
- Scorpio 3.0.0 (TEMPLATE bootstrap, independent of Artemis; never clears a non-empty workspace; asks before running the repository's Gradle wrapper unless the image sets `GRADLE_PREWARM_AUTO_CONFIRM=true`, which the Artemis Java images do), EduIDE-data-bridge 2.0.0 (per-instance token required, needs EduIDE-Cloud 3.0.0 and EduIDE-Helm 3.0.0) and the EduIDE-Cloud monitor extension 3.0.0
- npm dependency updates of the launcher and updater extensions ([#226](https://github.com/EduIDE/EduIDE/pull/226))

