#!/usr/bin/env bash
#
# release.sh — bump patch version, build, local install, commit, tag, push.
#
# Usage:  ./scripts/release.sh
#
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# Release artifacts and lockfile mutations must use the exact same toolchain as CI.
bash scripts/activate-toolchain.sh

# ── 0. Security check ────────────────────────────────────────────────────────
# Refuse to release if forbidden paths or credential-like patterns are staged.
# Bypass once with: SECURITY_CHECK_BYPASS=1 ./scripts/release.sh
./scripts/security-check.sh

# ── 1. Bump patch version ────────────────────────────────────────────────────

# Prefer the highest known release tag over package.json so stale local version
# files do not collide with an already-published tag.
git fetch --tags origin --quiet || true

PACKAGE_VERSION=$(node -p "require('./package.json').version")
LATEST_TAG=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -n 1 || true)
LATEST_TAG_VERSION=${LATEST_TAG#v}
BASE_VERSION=$(node -e "
  const versions = process.argv.slice(1).filter(Boolean);
  const parsed = versions.map((value) => value.split('.').map(Number));
  parsed.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
