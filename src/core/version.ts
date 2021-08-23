import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
