// A complete kernel-backed web app on ONE port: http serves the console UI, and the
// SAME server is the WebSurface ws host. Drives a real `claude` turn by default.
// This is "a swarmdeck-like project, built on @swarmdeck/kernel" — proving the kernel
// is a usable core, not just a library.
//
//   node packages/kernel/examples/server.mjs            # real claude on :3941
//   CONSOLE_REAL=0 PORT=3942 node .../server.mjs         # hermetic echo driver
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLoom, ClaudeDriver, EchoDriver, WebSurface } from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, 'console.html'), 'utf8');
const port = Number(process.env.PORT) || 3941;
const useReal = process.env.CONSOLE_REAL !== '0';

const server = http.createServer((req, res) => {
