#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const PACKAGES = ['swarmdeck', 'pikiclaw'];
const OUT = new URL('../docs/downloads.json', import.meta.url);

async function monthlyInstalls(pkg) {
  try {
    const res = await fetch(`https://api.npmjs.org/downloads/point/last-month/${pkg}`);
    const data = await res.json();
    return typeof data?.downloads === 'number' ? data.downloads : 0;
  } catch (err) {
    console.warn(`warn: ${pkg}: ${err.message}`);
