# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jdk-jammy

ARG JDTLS_VERSION=1.58.0
ARG JDTLS_URL=https://www.eclipse.org/downloads/download.php?file=/jdtls/snapshots/jdt-language-server-${JDTLS_VERSION}-202603121450.tar.gz

# Standard LS port and workspace path - configurable via env
ENV LS_PORT=5000
ENV WORKSPACE_PATH=/home/project

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 install -y --no-install-recommends \
    wget tar socat

WORKDIR /opt/jdt-ls

RUN wget --tries=5 --waitretry=2 --timeout=30 -q "${JDTLS_URL}" -O jdt-ls.tar.gz && \
    tar -xzf jdt-ls.tar.gz && \
    rm jdt-ls.tar.gz && \
    rm -rf config_win config_mac config_ss_win config_ss_mac config_ss_linux bin *.md LICENSE

RUN mkdir -p /home/project

RUN addgroup --system app && adduser --system --group app
RUN chown -R app:app /opt/jdt-ls && chown -R app:app /home/project

COPY images/languageserver/java/start-ls.sh /opt/start-ls.sh
RUN chmod +x /opt/start-ls.sh

USER app

EXPOSE 5000

ENTRYPOINT ["/opt/start-ls.sh"]
