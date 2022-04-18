import http from 'node:http';
import { writeScopedLog } from '../core/logging.js';

const SCOPE = 'anthropic-bridge';
const log = (m: string) => { writeScopedLog(SCOPE, m); };
const warn = (m: string) => { writeScopedLog(SCOPE, m, { level: 'warn', stream: 'stderr' }); };

let server: http.Server | null = null;
let listenPort = 0;
let starting: Promise<number> | null = null;
let idCounter = 0;

function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}
function num(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function decodeUpstream(token: string): string | null {
  try { return Buffer.from(token, 'base64url').toString('utf8') || null; } catch { return null; }
}
function chatCompletionsUrl(base: string): string {
  const b = base.replace(/\/+$/, '');
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
}

export async function ensureAnthropicBridge(): Promise<number> {
  if (server && listenPort) return listenPort;
  if (starting) return starting;
  starting = new Promise<number>((resolve, reject) => {
    const srv = http.createServer(handleRequest);
    srv.on('error', err => { warn(`server error: ${(err as any)?.message || err}`); reject(err); });
    srv.listen(0, '127.0.0.1', () => {
      server = srv;
      const addr = srv.address();
      listenPort = typeof addr === 'object' && addr ? addr.port : 0;
      log(`listening on 127.0.0.1:${listenPort}`);
      resolve(listenPort);
    });
  });
  try { return await starting; } finally { starting = null; }
}

export function shutdownAnthropicBridge(): void {
  try { server?.close(); } catch {  }
  server = null;
  listenPort = 0;
}

function readBearer(req: http.IncomingMessage): string {
  const xkey = req.headers['x-api-key'];
  if (typeof xkey === 'string' && xkey) return xkey;
  const auth = req.headers['authorization'];
  const a = Array.isArray(auth) ? auth[0] : auth;
  if (typeof a === 'string') return a.replace(/^Bearer\s+/i, '');
  return '';
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const m = url.pathname.match(/^\/u\/([^/]+)\/v1\/(messages|messages\/count_tokens|models)$/);
  if (!m) { res.writeHead(404).end('not found'); return; }
  const upstreamBase = decodeUpstream(m[1]);
  if (!upstreamBase) { res.writeHead(400).end('bad upstream token'); return; }
  const route = m[2];

  if (route === 'models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [], has_more: false }));
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405).end('method not allowed'); return; }

  const chunks: Buffer[] = [];
  req.on('data', c => chunks.push(c as Buffer));
  req.on('end', () => {
    let body: any = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
    if (route === 'messages/count_tokens') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ input_tokens: estimateTokens(body) }));
      return;
