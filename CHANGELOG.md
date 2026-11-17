# Changelog

Release notes of the EduIDE images. `release.yml` copies the section of a version into its GitHub Release, see `.claude/skills/release/SKILL.md`.

## [Unreleased]

### Breaking changes

- Every language comes in two editions instead of per-university images: `ghcr.io/eduide/eduide/<lang>-artemis` (with the Artemis extension) and `<lang>-standalone` (git credentials cached in memory for 3 hours), both on Ubuntu 26.04. The images `java-17`, `java-25`, `python`, `javascript`, `c`, the `*-templates` images and `thm-java-25` get no new tags. Installation-specific images derive FROM an edition image (template repository EduIDE/EduIDE-image-mannheim) ([#221](https://github.com/EduIDE/EduIDE/pull/221))
- Live Preview is removed; HTML preview uses Theia's mini browser ("Open Preview to the Side") ([#221](https://github.com/EduIDE/EduIDE/pull/221))

### Features

- Rust is back and Go is new, with starter templates for Python, Node (TypeScript), Web (TypeScript), Cargo and Go next to the Java and C ones. Scorpio applies a template from `/home/theia/templates` when a session starts without a repository ([#222](https://github.com/EduIDE/EduIDE/pull/222))
- Spell checker (English, German), Error Lens and EditorConfig in every image; the Python images ship numpy, pandas, matplotlib, uv and ruff, and Ruff formats Python on save ([#221](https://github.com/EduIDE/EduIDE/pull/221))
- Experience levels apply to every language and take effect immediately; the status bar shows "Temporary workspace" or "Saved workspace" ([#220](https://github.com/EduIDE/EduIDE/pull/220))
- Browser input now counts as session activity, so a session that is in use is not stopped as idle ([#218](https://github.com/EduIDE/EduIDE/pull/218))

### Fixes

- The browser tab and window title name the application EduIDE ([#219](https://github.com/EduIDE/EduIDE/pull/219))
- The Welcome page no longer offers `Open Version Control` and `Open new Terminal` while the Beginner level (or an override) turns Source Control and the terminal off ([#229](https://github.com/EduIDE/EduIDE/pull/229))
- C sessions with a Makefile no longer open with the Makefile Tools "Configuring project ... Do you want to continue?" dialog, which swallowed the student's first action; the images and the Make template turn off `makefile.configureOnOpen`, `makefile.configureOnEdit` and `makefile.configureAfterCommand` (clangd provides IntelliSense and does not use that configure)

### Changes

- The Artemis edition sets `GRADLE_PREWARM_AUTO_CONFIRM=true` (Java images and the base), so scorpio starts the Gradle prewarm without a prompt; standalone editions keep the prompt

### Security

- The unpublished `swift` image binds the IDE to `127.0.0.1` like the published ones, and the retired `-no-ls`, `languageserver` and `theia-ls-setup` directories are removed
- Downloads of rustup, Bazelisk and the Artemis extension are checked against pinned SHA-256 sums; the Python packages and the `alpine/git` stage are pinned to versions. The Artemis extension is no longer re-downloaded without the checksum in the language images. Plugin vsix downloads from `package.json` remain pinned by version only
- The local compose file publishes its ports on `127.0.0.1` only
- A manual run of the image build refuses version tags (`1.2.3`, `1.2.3-rc.1`); only the release workflow publishes those

### Dependencies

- Scorpio 3.0.0 (TEMPLATE bootstrap, independent of Artemis; never clears a non-empty workspace; asks before running the repository's Gradle wrapper unless the image sets `GRADLE_PREWARM_AUTO_CONFIRM=true`, which the Artemis Java images do), EduIDE-data-bridge 2.0.0 (per-instance token required, needs EduIDE-Cloud 3.0.0 and EduIDE-Helm 3.0.0) and the EduIDE-Cloud monitor extension 3.0.0
- npm dependency updates of the launcher and updater extensions ([#226](https://github.com/EduIDE/EduIDE/pull/226))

