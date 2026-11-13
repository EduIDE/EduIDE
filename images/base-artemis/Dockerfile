# syntax=docker/dockerfile:1
# Artemis edition of the base image: the base plus the Artemis extension.
# The extension goes into plugins/ and into package.json, so the language
# images' `yarn download:plugins:smart` (prune and sync against package.json)
# keeps it.
ARG BASE_IDE_TAG=latest
ARG BASE_IMAGE=ghcr.io/eduide/eduide/base:${BASE_IDE_TAG}
ARG ARTEMIS_EXTENSION_URL=https://open-vsx.org/api/aet-tum/iris-thaumantias/1.2.6/file/aet-tum.iris-thaumantias-1.2.6.vsix

FROM alpine:3.22 AS artemis-extension
ARG ARTEMIS_EXTENSION_URL
RUN apk add --no-cache curl unzip
RUN curl --retry 5 --retry-all-errors --connect-timeout 30 --max-time 120 -fsSL -o /tmp/artemis.vsix "${ARTEMIS_EXTENSION_URL}" \
    && mkdir /artemis-extension \
    && unzip -q /tmp/artemis.vsix -d /artemis-extension

FROM ${BASE_IMAGE}
ARG ARTEMIS_EXTENSION_URL
COPY --from=artemis-extension /artemis-extension /home/theia/plugins/artemis-extension
RUN node -e "const fs=require('fs'); \
const p=JSON.parse(fs.readFileSync('/home/theia/package.json')); \
p.theiaPlugins['artemis-extension']=process.env.ARTEMIS_EXTENSION_URL; \
fs.writeFileSync('/home/theia/package.json', JSON.stringify(p, null, 2));"
