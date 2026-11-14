# syntax=docker/dockerfile:1
# Standalone edition of the base image: the base plus a git credential cache.
# Without Artemis there is no token to hand out, so students type their git
# credentials once and the cache forgets them after three hours.
ARG BASE_IDE_TAG=latest
ARG BASE_IMAGE=ghcr.io/eduide/eduide/base:${BASE_IDE_TAG}
FROM ${BASE_IMAGE}

# Numeric owner: the base has no theia user, the language images re-chown anyway.
COPY --chown=101:101 images/base-standalone/gitconfig /home/theia/.gitconfig
