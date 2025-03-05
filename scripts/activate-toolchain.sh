#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_NPM="$(node -p "require('${ROOT}/package.json').packageManager.split('@').at(-1)")"
CURRENT_NPM="$(npm --version)"

if [[ "${CURRENT_NPM}" != "${EXPECTED_NPM}" ]]; then
  echo "▸ npm ${CURRENT_NPM} → ${EXPECTED_NPM}"
  # Run outside the repository so an older npm can upgrade itself before the
