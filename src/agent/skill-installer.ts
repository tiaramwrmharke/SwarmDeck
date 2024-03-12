import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STATE_DIR_NAME } from '../core/constants.js';

export interface SkillInstallOpts {
  global?: boolean;
  skill?: string;
  workdir?: string;
  sourceSha?: string | null;
  sourceNames?: string[];
}

export interface SkillInstallResult {
  ok: boolean;
  error?: string;
  output?: string;
}

export interface SkillRemoveResult {
  ok: boolean;
  error?: string;
}

const GLOBAL_SKILLS_DIR = path.join(os.homedir(), STATE_DIR_NAME, 'skills');
const INSTALL_TIMEOUT_MS = 60_000;
const REMOVE_TIMEOUT_MS = 10_000;

const SKILL_LEDGER_FILE = '.swarmdeck-skills-ledger.json';

export interface SkillLedgerEntry {
  source: string;
  sha: string | null;
  installedAt: number;
  names?: string[];
}

interface SkillLedger {
  version: 1;
  entries: Record<string, SkillLedgerEntry>;
}

interface LedgerScope { global?: boolean; workdir?: string }

function ledgerPath(opts: LedgerScope): string | null {
  if (opts.global) return path.join(GLOBAL_SKILLS_DIR, SKILL_LEDGER_FILE);
  if (opts.workdir) return path.join(opts.workdir, STATE_DIR_NAME, 'skills', SKILL_LEDGER_FILE);
  return null;
}

export function normalizeSkillSourceKey(source: string): string {
  return String(source || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}
