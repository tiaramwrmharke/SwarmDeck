import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STATE_DIR_NAME } from '../constants.js';

const SALT_FILE = path.join(os.homedir(), STATE_DIR_NAME, '.machine-salt');
const VERSION_TAG = 'v1';

function readOrCreateSalt(): Buffer {
  try {
    const raw = fs.readFileSync(SALT_FILE);
    if (raw.length >= 32) return raw.subarray(0, 32);
  } catch {}
  const salt = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(SALT_FILE), { recursive: true });
