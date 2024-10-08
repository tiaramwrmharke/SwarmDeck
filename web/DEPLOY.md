# Deploying the swarmdeck landing page

This is a **standalone static site** (Vite + React 19 + Tailwind 4 + React Bits).
It lives in `web/` inside the swarmdeck repo, builds to `web/dist/`, and is **never
published to npm** (root `package.json` `files` only ships `dist/` + `dashboard/dist/`).

```bash
npm --prefix web install
npm --prefix web run build      # → web/dist/  (static, host anywhere)
npm --prefix web run dev        # local preview at http://localhost:4321
```

---

## Recommended: Cloudflare Pages (free, git auto-deploy, global CDN, free SSL)

Chosen because: zero cost, automatic deploy on every push, free wildcard SSL,
**no ICP filing required**, and the most reliable reachability from mainland China
among the international free hosts (better than Vercel / github.io).

### 1. Connect the repo (one-time)
Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** →
pick `xiaotonng/swarmdeck`.

### 2. Build settings
| Field | Value |
|-------|-------|
| Production branch | `main` |
| Framework preset | `Vite` (or None) |
