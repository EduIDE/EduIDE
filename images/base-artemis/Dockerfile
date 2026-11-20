# syntax=docker/dockerfile:1
# Artemis edition of the base image: the base plus the Artemis extension.
# The extension goes into plugins/ only, as the verified unpacked vsix. It is
# deliberately not in package.json theiaPlugins: `yarn download:plugins:smart`
# in the language images would re-download its URL without the checksum. The
# language images' final stage copies /home/theia from this image, so the folder
# reaches them there.
ARG BASE_IDE_TAG=latest
ARG BASE_IMAGE=ghcr.io/eduide/eduide/base:${BASE_IDE_TAG}
ARG ARTEMIS_EXTENSION_URL=https://open-vsx.org/api/aet-tum/iris-thaumantias/1.2.8/file/aet-tum.iris-thaumantias-1.2.8.vsix
# sha256 of the vsix above, checked in the build. Bumped together with the URL
# by artemis_extension_auto_update.yml.
ARG ARTEMIS_EXTENSION_SHA256=61f8284ec781f2b3cdef141b94d62f893ddbefb249c312918754ab9948e90e8b

FROM alpine:3.22 AS artemis-extension
ARG ARTEMIS_EXTENSION_URL
ARG ARTEMIS_EXTENSION_SHA256
RUN apk add --no-cache curl unzip
RUN curl --retry 5 --retry-all-errors --connect-timeout 30 --max-time 120 -fsSL -o /tmp/artemis.vsix "${ARTEMIS_EXTENSION_URL}" \
    && echo "${ARTEMIS_EXTENSION_SHA256}  /tmp/artemis.vsix" | sha256sum -c - \
    && mkdir /artemis-extension \
    && unzip -q /tmp/artemis.vsix -d /artemis-extension

FROM ${BASE_IMAGE}
# Artemis repositories come from the course, so scorpio may start the Gradle
# prewarm without asking. Standalone editions keep the prompt.
ENV GRADLE_PREWARM_AUTO_CONFIRM=true
COPY --from=artemis-extension /artemis-extension /home/theia/plugins/artemis-extension
