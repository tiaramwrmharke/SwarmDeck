#!/usr/bin/env bash
#
# security-check.sh — refuse the release if dangerous content is staged.
#
# Scans the files that would be in the next commit (tracked + untracked
# but not gitignored) for:
#   • forbidden filename patterns (debug logs, secret files, private keys)
#   • token / credential patterns inside file contents
#
# Wired into scripts/release.sh as step 0. Can also be invoked manually:
#     ./scripts/security-check.sh
#
# Bypass once (only after eyeballing the matches and confirming they are
# safe):
#     SECURITY_CHECK_BYPASS=1 ./scripts/release.sh
#
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

if [ "${SECURITY_CHECK_BYPASS:-}" = "1" ]; then
  echo "▸ Security check: bypassed via SECURITY_CHECK_BYPASS=1"
  exit 0
fi

echo "▸ Security check: scanning paths…"

# Build the list of files that would be in the next commit:
# tracked (-c) + untracked but not gitignored (-o --exclude-standard).
files=()
while IFS= read -r line; do
  [ -n "$line" ] && [ -f "$line" ] && files+=("$line")
done < <(git ls-files -c -o --exclude-standard | sort -u)

violations=0

# ── 1. Forbidden filename / directory patterns ──────────────────────────
forbidden_paths=(
  '\.playwright-mcp/'                         # browser MCP debug logs
  '(^|/)\.env$'                                # .env at root or nested
  '(^|/)\.env\.[^/]*$'                         # .env.local, .env.production, etc.
  '\.pem$'                                     # PEM key/cert
