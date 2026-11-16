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

### Dependencies

- Scorpio 2.2.0 (TEMPLATE bootstrap, independent of Artemis), EduIDE-data-bridge 1.0.0 (atomic injection) and the EduIDE-Cloud monitor extension 2.0.1
- npm dependency updates of the launcher and updater extensions ([#226](https://github.com/EduIDE/EduIDE/pull/226))

