#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Usage: node scripts/retained-tee.mjs <log-file>\n');
  process.exit(1);
}

const positiveIntEnv = (name, fallback) => {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const maxLines = positiveIntEnv('PIKILOOM_LOG_MAX_LINES', 5000);
const maxAgeMs = positiveIntEnv('PIKILOOM_LOG_MAX_AGE_MS', 24 * 60 * 60 * 1000);
const trimEveryWrites = positiveIntEnv('PIKILOOM_LOG_TRIM_EVERY_WRITES', 200);

