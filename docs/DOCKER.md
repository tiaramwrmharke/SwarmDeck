# SwarmDeck on Docker

> 中文版在文末 ↓ — [中文文档](#中文文档)

SwarmDeck ships an official multi-arch image so you can run the bot on a
Linux server (or any Docker host) without installing Node or the agent CLIs
on the host itself. The image bakes in `claude-code`, `codex`, and
`gemini-cli` and exposes the web dashboard on port `3939`.

| Tag                        | When it's pushed                              |
|----------------------------|-----------------------------------------------|
| `ghcr.io/xiaotonng/swarmdeck:latest`  | newest tagged release                |
| `ghcr.io/xiaotonng/swarmdeck:vX.Y.Z`  | exact version (recommended in production)     |
| `ghcr.io/xiaotonng/swarmdeck:X.Y`     | latest patch on the X.Y line                  |
| `ghcr.io/xiaotonng/swarmdeck:edge`    | rolling build from `main` — for early adopters |

Supported platforms: `linux/amd64`, `linux/arm64`.

---

## 1. Quick start (docker run)

```bash
docker run -d --name swarmdeck --restart unless-stopped \
  -p 3939:3939 \
  -e TELEGRAM_BOT_TOKEN=123456:replace_me \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v swarmdeck-config:/home/piki/.swarmdeck \
  -v swarmdeck-workspace:/workspace \
  ghcr.io/xiaotonng/swarmdeck:latest
```

Then open `http://<host>:3939` and finish setup from the dashboard.

## 2. docker compose (recommended)

The repo ships a ready-to-use `docker-compose.yml`. Put your secrets in a
`.env` next to it:

```bash
cp .env.example .env
# edit .env — at minimum one IM token + one agent API key
docker compose up -d
docker compose logs -f
```

The compose file declares two named volumes:

- `swarmdeck-config` → `/home/piki/.swarmdeck` — `setting.json`, MCP/CLI
  state, sessions, etc. Keep this across upgrades.
- `swarmdeck-workspace` → `/workspace` — the project tree the agent reads
  and writes. Swap to a host bind mount if you want to edit it from your
  IDE on the host.

## 3. Authentication

The image bakes the agent CLIs but ships with **zero credentials**. Pick one
path per agent:

### A. API keys via env vars (simplest, recommended for headless servers)

| Agent  | Env var |
|--------|---------|
| Claude Code | `ANTHROPIC_API_KEY` *or* `CLAUDE_CODE_OAUTH_TOKEN` |
| Codex  | `OPENAI_API_KEY` |
| Gemini | `GEMINI_API_KEY` |

For Claude, you can obtain a long-lived OAuth token on a host with a browser
by running `claude setup-token`, then paste it as `CLAUDE_CODE_OAUTH_TOKEN`
into the container env.

### B. Reuse an existing host OAuth login (bind mount)

If you already ran `claude login` / `codex login` on the same host the
container runs on, you can mount the per-CLI config dirs:

```yaml
volumes:
  - ${HOME}/.claude:/home/piki/.claude
  - ${HOME}/.codex:/home/piki/.codex
  - ${HOME}/.gemini:/home/piki/.gemini
```

This also makes **agent session history sync** between the host and the
container — codex / claude / gemini each store their per-session transcripts
under these directories (`~/.codex/sessions/`, `~/.claude/projects/`, …), so a
conversation you started on the host can be resumed inside the container and
vice-versa. If you don't bind-mount (i.e. you keep the default named-volume
layout), each environment keeps its own independent session history.

> ⚠️ **Codex SQLite corruption risk.** The Codex CLI keeps its state in a
> SQLite database under `~/.codex/`. SQLite does **not** tolerate concurrent
> writers from different processes when the file lives on a docker bind mount,
> nor does it tolerate two binaries of different versions opening the same db.
> If you mount `~/.codex` into the container, you **must** treat it as a
> single-writer file:
>
> - Do not run the host's Codex desktop app while the docker container is
>   also running with codex active. Stop one before using the other.
> - When you `docker pull` a newer swarmdeck image, the codex CLI baked into
>   the image (see §5) may be newer than the host's. Either pin the
>   `CODEX_VERSION` build-arg to match the host, or upgrade the host's codex
>   at the same time.
> - If you only need OAuth credentials (and don't need to share session
>   history), mount **just** the auth file read-only — this avoids the db
>   entirely:
>
>   ```yaml
>   volumes:
>     - ${HOME}/.codex/auth.json:/home/piki/.codex/auth.json:ro
>   ```
>
> Symptoms of a corrupted db: when launching Codex desktop you see
> `database disk image is malformed` / `error returned from database: (code: 11)`.
