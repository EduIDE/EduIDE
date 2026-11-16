# syntax=docker/dockerfile:1
# Artemis edition of the base image: the base plus the Artemis extension.
# The extension goes into plugins/ and into package.json, so the language
# images' `yarn download:plugins:smart` (prune and sync against package.json)
# keeps it.
ARG BASE_IDE_TAG=latest
ARG BASE_IMAGE=ghcr.io/eduide/eduide/base:${BASE_IDE_TAG}
ARG ARTEMIS_EXTENSION_URL=https://open-vsx.org/api/aet-tum/iris-thaumantias/1.2.6/file/aet-tum.iris-thaumantias-1.2.6.vsix
# sha256 of the vsix above, checked in the build. Bumped together with the URL
# by artemis_extension_auto_update.yml.
ARG ARTEMIS_EXTENSION_SHA256=19766ad613e164e34611f1d481c861a8b0b46a25dddd48ff0152ca80d8cbf95b

FROM alpine:3.22 AS artemis-extension
ARG ARTEMIS_EXTENSION_URL
ARG ARTEMIS_EXTENSION_SHA256
RUN apk add --no-cache curl unzip
RUN curl --retry 5 --retry-all-errors --connect-timeout 30 --max-time 120 -fsSL -o /tmp/artemis.vsix "${ARTEMIS_EXTENSION_URL}" \
    && echo "${ARTEMIS_EXTENSION_SHA256}  /tmp/artemis.vsix" | sha256sum -c - \
    && mkdir /artemis-extension \
    && unzip -q /tmp/artemis.vsix -d /artemis-extension

FROM ${BASE_IMAGE}
ARG ARTEMIS_EXTENSION_URL
COPY --from=artemis-extension /artemis-extension /home/theia/plugins/artemis-extension
RUN node -e "const fs=require('fs'); \
const p=JSON.parse(fs.readFileSync('/home/theia/package.json')); \
p.theiaPlugins['artemis-extension']=process.env.ARTEMIS_EXTENSION_URL; \
fs.writeFileSync('/home/theia/package.json', JSON.stringify(p, null, 2));"
