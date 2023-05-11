#!/usr/bin/env node
// Renders docs/star-history.svg from the repo's stargazer timestamps, so the
// README's "Star History" chart is a self-hosted static SVG instead of the
// star-history.com hotlink (whose shared GitHub tokens are chronically
// rate-limited and 503 the image). Mirrors refresh-download-badge.mjs: commit
// only when the curve changes, refreshed weekly by star-history-badge.yml.
import { writeFileSync } from 'node:fs';

const REPO = 'xiaotonng/swarmdeck';
const OUT = new URL('../docs/star-history.svg', import.meta.url);
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const W = 640;
const H = 320;
const M = { top: 24, right: 24, bottom: 40, left: 56 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const ACCENT = '#38bdf8';
const GRID = '#8b949e';

async function fetchStarredAt() {
  const headers = {
    Accept: 'application/vnd.github.star+json',
    'User-Agent': 'swarmdeck-star-history',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const dates = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/stargazers?per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const s of batch) if (s?.starred_at) dates.push(new Date(s.starred_at).getTime());
    if (batch.length < 100) break;
  }
  return dates.sort((a, b) => a - b);
}

function niceCeil(n) {
  if (n <= 5) return 5;
