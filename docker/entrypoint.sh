#!/usr/bin/env bash
#
# swarmdeck-entrypoint — container init for the swarmdeck image.
#
# Responsibilities (kept tiny on purpose):
#   1. Ensure the per-user state dirs exist with the right ownership when the
#      image is launched with `--user 0:0` or when a bind-mounted host dir came
#      in owned by a foreign uid.
#   2. Echo a small banner so the user can see config status at a glance.
#   3. exec the compiled swarmdeck CLI with the user-supplied args.
#
# We deliberately do NOT:
#   - Auto-write setting.json: the dashboard does that, and overwriting blindly
#     would clobber any mounted volume.
#   - Re-install agent CLIs: the image bakes them. Users who want a different
#     version should rebuild with --build-arg or `docker exec` to `npm i -g`.
#
# Signal handling is provided by tini in the Dockerfile ENTRYPOINT, not here.

