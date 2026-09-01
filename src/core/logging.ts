import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogStream = 'stdout' | 'stderr';

interface RetainedLogOptions {
  maxLines?: number;
  maxAgeMs?: number;
  trimEveryWrites?: number;
}

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_LOG_MAX_LINES = 5000;
const DEFAULT_LOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOG_TRIM_EVERY_WRITES = 200;

function positiveIntEnv(name: string, fallback: number): number {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
