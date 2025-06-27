#!/usr/bin/env bash

set -euo pipefail

DEV_DIR="${HOME}/.swarmdeck/dev"
LOG_FILE="${DEV_DIR}/dev.log"

# Dev dashboard always binds this port. dev.sh frees it before (re)starting so a
# restart deterministically rebinds the same port instead of drifting upward via
# the server's EADDRINUSE retry. Read before the env scrub; override with
# PIKILOOM_DEV_PORT if you really need a different one.
DEV_PORT="${PIKILOOM_DEV_PORT:-3940}"

# Dev mode must stay on the local source tree.
# Do not hop into the production/self-bootstrap `npx swarmdeck@latest` chain.
mkdir -p "${DEV_DIR}"

# Decide whether to detach early.
#
# Why this happens FIRST, before any kill / build:
# dev.sh restarts the running swarmdeck runtime, and when invoked from inside an
# agent session (Codex app-server, Claude `-p`, …) that runtime IS the host
# process for the agent. If we kill the runtime while still living in the
# agent's bash subtree, the agent's stdio breaks mid-script: Codex cancels the
# current turn and tears down the bash subprocess, killing dev.sh before it can
# hand off to nohup, so the new dev never starts. Detaching first severs us
# from that subtree so the subsequent kill is safe.
#
# Priority:
#   already detached (PIKILOOM_DEV_DETACHED=1)   -> no, we ARE the worker
#   PIKILOOM_DEV_BACKGROUND=1                    -> yes
#   PIKILOOM_DEV_FOREGROUND=1                    -> no
#   no controlling TTY (agent Bash tool, piped)  -> yes
#   otherwise                                    -> no (interactive terminal)
_should_detach=0
if [[ "${PIKILOOM_DEV_DETACHED:-0}" == "1" ]]; then
  _should_detach=0
elif [[ "${PIKILOOM_DEV_BACKGROUND:-0}" == "1" ]]; then
  _should_detach=1
elif [[ "${PIKILOOM_DEV_FOREGROUND:-0}" == "1" ]]; then
  _should_detach=0
elif [[ ! -t 1 ]]; then
  _should_detach=1
fi

if (( _should_detach )); then
  : > "${LOG_FILE}"
  # Agent tool runners can clean up the shell's remaining child process tree
  # after this parent exits. Launch the worker in a new session from a short
  # Python parent so it is reparented before the tool runner performs cleanup.
  if command -v python3 >/dev/null 2>&1; then
    _bg_pid=$(python3 - "$0" "${LOG_FILE}" "$(pwd)" "$@" <<'PY'
import os
import subprocess
import sys

script, log_file, workdir, *args = sys.argv[1:]
