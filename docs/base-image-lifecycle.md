# Base image lifecycle

Every EduIDE image is built on a distro that has an end-of-life date. When that date passes, the
build does not degrade gracefully - it breaks, usually weeks later and usually during a release.
This document records what each image sits on, when it expires, and how the breakage looks so the
next person recognises it in the first minute instead of the first hour.

## What we build on

| Base | Used by | Supported until |
|---|---|---|
| `node:22-trixie`, `node:22-trixie-slim` | `BaseDockerfile` (all three stages), every `plugin-image` stage, `theia-no-ls` final stage | Debian 13: regular support 2028-08-09, then LTS to 2030-06-30 |
| `ubuntu:24.04` | the `apt-deps` stage of most language images, including `python` | 2029-04 (standard), 2034-04 (ESM) |
| `ubuntu:26.04` | `thm-java-25` | 2031-04 (standard) |
| `eclipse-temurin:21-jdk-jammy` | `languageserver/java` (unpublished) | Ubuntu 22.04: 2027-04 |
| `alpine:3.22` | `languageserver/rust` (unpublished) | 2027-05 |
| `swift:focal` | `swift` (unpublished, in no build matrix) | **already EOL** |

Node's own version is pinned separately in each Dockerfile (`node:22-…`). Bumping the Node major
and bumping the Debian suite are two different decisions - do not fold them into one commit.

Pick the Debian suite that is *current stable*, not merely the one that is still supported. A
Debian release gets three years of regular support and two more of LTS, and the LTS half is where
the sharp edges live: fewer architectures, fewer covered packages, and a pool that gets emptied
the moment it ends. Debian 12 was already in its LTS half when this migration happened, which is
why it was skipped in favour of 13.

## How an EOL distro actually breaks the build

Debian 11 (bullseye) went EOL on 2026-08-31 and took the v1.2.1 release build with it:

```
Err:3 http://deb.debian.org/debian-security bullseye-security/main amd64 libglib2.0-0 2.66.8-1+deb11u8
  404  Not Found
E: Failed to fetch .../libglib2.0-0_2.66.8-1+deb11u8_amd64.deb  404  Not Found
```

The confusing part is that `apt-get update` succeeded. After EOL the suite is taken apart in two
steps: the `bullseye-security` index stayed online, frozen at its last build, while the `.deb`
files it points at were purged from the pool, and `archive.debian.org` had not yet picked up the
security suite. So apt resolved a package version from a valid index and then 404'd fetching it.
Only packages that had a security update were affected - everything from `bullseye/main`
downloaded fine, which makes the failure look like a flaky mirror rather than an EOL.

If you see a 404 on a *specific* `.deb` while `apt-get update` passes, check the suite's EOL date
before you touch anything else.

## Nightly builds are the early warning

`.github/workflows/build.yml` sets `no-cache: true` on the nightly `schedule` run, and on a manual
`workflow_dispatch` when `disable_layer_cache` is ticked. Those are the runs that actually exercise
`apt-get` against the live mirrors; a PR or push build reuses the cached apt layer and will keep
passing for weeks after the distro has died underneath it. The nightly is the only one of the two
that happens on its own, which makes it the standing early warning - the bullseye failure sat in it
for three days before the release hit the same wall.

If you are about to cut a release and want certainty rather than last night's evidence, dispatch
the workflow manually with `disable_layer_cache` on.

A red nightly build is not noise. Treat it as the thing it is: the next release, failing early.

## Changing a base image

1. Change it in every Dockerfile at once. A split base (some images on the old suite, some on the
   new) means the glibc of `COPY --from` artefacts stops matching the final stage.
2. Mind the glibc direction. Binaries and native modules built in a newer distro do not run on an
   older one. The base image's artefacts are copied into each language image's final stage, so the
   final stage must never be older than `BaseDockerfile`'s stages.
3. Build the base image and at least one language image locally before pushing - the PR build only
   covers amd64, and only after the base succeeds.
