# syntax=docker/dockerfile:1.7
#
# SwarmDeck — Docker image
#
# Layered approach:
#   1. `builder`  full deps, compiles TS + builds Vite dashboard
#   2. `deps`     production-only node_modules (no devDeps)
#   3. `runtime`  pinned Node/npm + agent CLIs (claude / codex / gemini) baked in,
#                 non-root user, /workspace and /home/piki/.swarmdeck as volumes
#
# Build:
#   docker build -t swarmdeck:local .
#
# Run (named volumes + Telegram example):
#   docker run --rm -it -p 3939:3939 \
#     -e TELEGRAM_BOT_TOKEN=...:... \
#     -e ANTHROPIC_API_KEY=sk-ant-... \
#     -v swarmdeck-config:/home/piki/.swarmdeck \
#     -v swarmdeck-workspace:/workspace \
#     ghcr.io/xiaotonng/swarmdeck:latest
#
# See docs/DOCKER.md for the full reference.

ARG NODE_VERSION=22.23.1-bookworm-slim
ARG NPM_VERSION=11.6.2

# ---------------------------------------------------------------------------
# Stage 1 — builder: install all deps, compile TS, build the Vite dashboard.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
ARG NPM_VERSION

WORKDIR /build

RUN npm install --global --no-audit --no-fund "npm@${NPM_VERSION}" \
 && test "$(npm --version)" = "${NPM_VERSION}"

# Native modules (@napi-rs/keyring is optional but pulls a tiny build chain)
# need python + a C toolchain. Slim has neither; install minimally.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git python3 build-essential \
 && rm -rf /var/lib/apt/lists/*

# Install with full deps so tsc + vite are available.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy only what `npm run build` (tsc + vite) needs. .dockerignore
# already keeps node_modules, dist/, .swarmdeck/, .scratch/, etc. out.
COPY .nvmrc Dockerfile ./
COPY scripts/verify-toolchain.mjs ./scripts/verify-toolchain.mjs
COPY tsconfig.json ./tsconfig.json
