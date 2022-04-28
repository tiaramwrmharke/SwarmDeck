import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NativeSessionInfo } from '../contracts/driver.js';

// ---- Native session discovery ----
//
// Each coding-agent CLI keeps its OWN session transcripts in its own home dir, in its own
// format. To present a single, unified session list (the kernel's managed sessions PLUS the
// agent's native ones), the kernel reads those transcript stores directly. These are pure,
// node-builtins-only readers — faithful, leaner ports of swarmdeck's per-driver discovery.
//
// `home` is injectable so this is hermetically testable; it defaults to os.homedir().

export type { NativeSessionInfo } from '../contracts/driver.js';

export interface DiscoverOptions {
  home?: string;
  limit?: number;
  /** A session whose file changed within this window is treated as "running". */
  runningThresholdMs?: number;
}

const NATIVE_SESSION_RUNNING_THRESHOLD_MS = 10_000;

function homeOf(opts?: DiscoverOptions): string {
  return opts?.home || os.homedir();
}

function cleanTitle(raw: string | null | undefined, max = 120): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...`;
}

function statSafe(p: string): fs.Stats | null {
  try { return fs.statSync(p); } catch { return null; }
}

// A transcript's title/preview/model/effort/turns all live in a BOUNDED slice of the file: the HEAD
// (first prompt, model, ai-title) and the TAIL (latest reply, last turn_context). We read only those
// slices — never the whole file — so discovery stays O(bounded) per session even when a rollout grows
// to hundreds of MB. Results are memoized by the file's (mtime,size): an unchanged transcript is read
// once and every later list call is free, so adding the tail read costs nothing on repeat. Any real
// change moves mtime+size and re-reads, so the cache can never go stale.
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 256 * 1024;
// Anchor resolvability is the one read that must follow a chain rather than a slice, so it gets a
// far larger (still bounded) window: the active leaf chain reaches back to the last /compact
// boundary, which sits well inside this for any transcript claude itself can still resume.
const CHAIN_BYTES = 16 * 1024 * 1024;

/** Read a bounded byte region as UTF-8. A partial leading/trailing line is expected; callers skip unparseable lines. */
function readRegion(filePath: string, start: number, length: number): string {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(Math.max(0, length));
    const n = fs.readSync(fd, buf, 0, buf.length, Math.max(0, start));
    return buf.toString('utf8', 0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function memoized<T>(cache: Map<string, { mtimeMs: number; size: number; value: T }>, filePath: string, stat: fs.Stats, compute: () => T): T {
  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.value;
  const value = compute();
  cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value });
  return value;
}

// ---- Last-activity clock ----
//
// A transcript's mtime is NOT a trustworthy activity clock. Any maintenance pass the owning CLI runs
// over its whole store rewrites every mtime at once — claude 2.1.220 backfilled a `last-prompt` resume
// index into every transcript it had, stamping months of history with one instant. The list order then
// degenerates into an arbitrary tie and a bounded `limit` cuts the genuinely-recent rows. The records
// themselves carry the durable clock, so take the newest in-file `timestamp` from a bounded tail slice
// and order by THAT.
const ACTIVITY_PROBE_BYTES = [64 * 1024, 1024 * 1024];
// Matched against raw text rather than parsed lines: the slice starts mid-record and a single base64
// image record can be megabytes, so parsing the window may legitimately yield no complete line. An
// occurrence nested inside a string payload is escaped (`\"timestamp\":`) and cannot match.
const IN_FILE_TIMESTAMP = /"timestamp"\s*:\s*"(\d{4}-\d\d-\d\dT[^"]+)"/g;

const activityCache = new Map<string, { mtimeMs: number; size: number; value: number | null }>();

/**
 * Newest in-file record timestamp in ms, or null when the transcript carries no usable clock (callers
 * fall back to mtime). Clamped to mtime — real activity always precedes the last write, so an unescaped
 * `timestamp` nested in some payload can never push a row above its own file.
 */
function readLastActivityMs(filePath: string, stat: fs.Stats): number | null {
  return memoized(activityCache, filePath, stat, () => {
    for (const probe of ACTIVITY_PROBE_BYTES) {
      const length = Math.min(probe, stat.size);
      let text: string;
      try { text = readRegion(filePath, stat.size - length, length); } catch { return null; }
      let newestMs: number | null = null;
      for (const match of text.matchAll(IN_FILE_TIMESTAMP)) {
        const ms = Date.parse(match[1]);
        if (Number.isFinite(ms) && (newestMs === null || ms > newestMs)) newestMs = ms;
      }
      if (newestMs !== null) return Math.min(newestMs, stat.mtimeMs);
      if (length >= stat.size) break; // the whole file was already in the window — nothing to escalate to
    }
    return null;
  });
}

/** Extract plain text from a Codex `response_item` message content (array of `{type,text}` blocks). */
function codexText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as Array<{ type?: string; text?: string }>)
    .filter((b) => b && typeof b.text === 'string' && (b.type === 'text' || (b.type ?? '').endsWith('_text')))
    .map((b) => b.text as string)
    .join('');
}

/** Reasoning effort from a Codex `turn_context` payload: top-level `effort`, else the nested collaboration setting. */
function codexEffortOf(payload: any): string | null {
  const top = payload?.effort;
  if (typeof top === 'string' && top.trim()) return top.trim();
  const re = payload?.collaboration_mode?.settings?.reasoning_effort;
  return typeof re === 'string' && re.trim() ? re.trim() : null;
}

// ---- Claude: ~/.claude/projects/<encoded-workdir>/<sessionId>.jsonl ----

/** Claude encodes a workdir into a project dir name by replacing non-alphanumerics with '-'. */
export function encodeClaudeProjectDir(workdir: string): string {
  return path.resolve(workdir).replace(/[^a-zA-Z0-9]/g, '-');
}

/** Extract plain text from a Claude `message.content` (string or block array). */
function claudeText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as any).type === 'text' && typeof (block as any).text === 'string') {
      parts.push((block as any).text);
    }
  }
  return parts.join(' ');
}

const claudeMetaCache = new Map<string, { mtimeMs: number; size: number; value: { title: string | null; model: string | null; preview: string | null; turns: number } }>();

function readClaudeMeta(filePath: string, stat: fs.Stats): { title: string | null; model: string | null; preview: string | null; turns: number } {
  return memoized(claudeMetaCache, filePath, stat, () => {
    const size = stat.size;
    let title: string | null = null;
    let headModel: string | null = null;
    let lastUser: string | null = null;
    let headAssistant: string | null = null;
    let turns = 0;
    let head = '';
    try {
      head = readRegion(filePath, 0, Math.min(HEAD_BYTES, Math.max(65536, size)));
    } catch { return { title: null, model: null, preview: null, turns: 0 }; }
