#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const PACKAGES = ['swarmdeck', 'pikiclaw'];
const OUT = new URL('../docs/downloads.json', import.meta.url);

