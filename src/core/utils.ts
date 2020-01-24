import fs from 'node:fs';
import path from 'node:path';
import { whichSync as platformWhichSync } from './platform.js';

export type ChatId = number | string;

export function ensureGitignore(dir: string) {
  try {
    const gi = path.join(dir, '.gitignore');
    if (!fs.existsSync(gi)) return;
    const managedLines = [
      '.swarmdeck/*',
      '!.swarmdeck/skills/',
      '!.swarmdeck/skills/**',
    ];
    const legacyLines = new Set([
      '.swarmdeck/',
      '.claude/skills/',
      '.agents/skills/',
    ]);
    const current = fs.readFileSync(gi, 'utf8');
    const rawLines = current.split(/\r?\n/);
    const kept = rawLines.filter(line => !legacyLines.has(line.trim()));
    const present = new Set(kept.map(line => line.trim()));
    const missing = managedLines.filter(line => !present.has(line));
    if (kept.length === rawLines.length && missing.length === 0) return;
    let next = kept.join('\n');
    if (missing.length) {
      if (next.length && !next.endsWith('\n')) next += '\n';
      next += missing.join('\n') + '\n';
    }
    if (current === next) return;
    fs.writeFileSync(gi, next);
  } catch {  }
}

export function envBool(name: string, def: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return def;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function envString(name: string, def: string): string {
  const raw = process.env[name];
  if (raw == null) return def;
  const trimmed = raw.trim();
  return trimmed || def;
}

export function envInt(name: string, def: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
