#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Usage: node scripts/retained-tee.mjs <log-file>\n');
  process.exit(1);
}

