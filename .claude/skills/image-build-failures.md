---
name: image-build-failures
description: Diagnose a failing EduIDE image build, especially apt and base-image failures. Use when a build workflow is red, an apt-get step fails, a release build breaks, or when changing the distro an image is built on.
---

# When an image build fails

Most of these builds fail for one of three reasons, and they look nothing alike.

## Read the failure before anything else

```bash
gh run view <run-id> --repo EduIDE/EduIDE                 # which job, which step
gh run view --repo EduIDE/EduIDE --job <job-id> --log > /tmp/build.log
grep -nE "^#[0-9]+ ERROR|E: |Err:|404|error:" /tmp/build.log | tail -40
```

The annotation on the run summary gives the failing `RUN` line but not the
cause. The cause is usually 20 lines above the error in the job log.

## A 404 on one .deb while apt-get update passed

This is an end-of-life distro, not a flaky mirror.

```
Err:3 http://deb.debian.org/debian-security bookworm-security/main amd64 libglib2.0-0 ...
  404  Not Found
E: Failed to fetch .../libglib2.0-0_..._amd64.deb  404  Not Found
```

After a Debian release goes EOL, the suite comes apart in two steps: the
`-security` index stays online, frozen at its last build, while the `.deb` files
it points at are purged from the pool. So apt resolves a package version from a
valid index and then 404s fetching it, and **only packages that had a security
update are affected** - everything else in the same `install` downloads fine.
That is what makes it read as a mirror glitch.

Confirm it in one command rather than guessing:

```bash
curl -sI -o /dev/null -w "%{http_code}\n" \
  http://deb.debian.org/debian-security/dists/<suite>-security/InRelease   # 200, frozen
curl -s http://deb.debian.org/debian-security/pool/updates/main/g/glib2.0/ \
  | grep -o 'libglib2.0-0_[^"]*amd64.deb' | sort -u                        # nothing for your suite
```

The fix is to move to the current stable suite, not to work around apt. See
`docs/base-image-lifecycle.md` for which distro each image sits on, the EOL
dates, and the rule about picking a suite that is *current stable* rather than
one that is merely still supported.

## Green yesterday, red today, nothing changed

Look at what triggers each run before concluding anything is flaky:

| Trigger | apt layer |
|---|---|
| nightly `schedule` | **no cache** - hits the live mirrors |
| `workflow_dispatch` with `disable_layer_cache` | **no cache** |
| pull request, push, release | cached - can keep passing for weeks after the distro dies |

A red nightly with green PR builds is not noise. It is the next release
failing early, and it means the cached apt layer is the only thing still
holding the build together. The bullseye EOL sat in the nightly for three days
before it took a release build down.

Before tagging a release, dispatch `build.yml` manually with
`disable_layer_cache` on. That is the only way to know the build works against
the mirrors as they are now rather than as they were when the cache was warm.

## Changing the distro an image is built on

Change it everywhere at once. A split base - some images on the old suite, some
on the new - means the glibc of `COPY --from` artefacts stops matching the final
stage. The final stage must never be older than `BaseDockerfile`'s stages,
since the base image's output is copied into each language image.

Verify locally before pushing; the PR build is the slow way to find out:

```bash
docker build -f images/base-ide/BaseDockerfile -t theia-base:local .
docker build --build-arg BASE_IMAGE=theia-base:local \
  -f images/java-17/ToolDockerfile -t eduide-java-17:local .
docker run --rm --entrypoint sh eduide-java-17:local -c "java -version; node -v; id"
```

Build the base, one plain language image, and - if you touched it - `python`,
which is the one on a different `apt-deps` base from the rest.

## Ubuntu-based images fail differently

The `apt-deps` stages are Ubuntu, not Debian, and an EOL Ubuntu keeps serving
from `old-releases.ubuntu.com` rather than 404ing mid-pool. The symptom there is
a total `apt-get update` failure, not one missing package.

Ubuntu 24.04 also marks its Python as externally managed (PEP 668), so a plain
`pip3 install` fails with `error: externally-managed-environment`. The python
image removes the marker deliberately - there is one Python in the container and
students install into it.

## What a release build actually does

A release publishes `X.Y.Z` (the tag without its `v`) for every image in
`build.yml`'s matrix plus `base`. It runs *after* the GitHub release is created
and takes the better part of an hour, so a release existing does not mean its
images do:

```bash
gh run list --repo EduIDE/EduIDE --event release --limit 1
docker manifest inspect ghcr.io/eduide/eduide/java-17:1.3.0
```

Nothing downstream should move until that build is green. EduIDE-Helm's chart
release now refuses to publish a chart pinning images that are not there, but
checking first is cheaper than a red build.
