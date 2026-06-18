import http from 'node:http';
import { writeScopedLog } from '../core/logging.js';

const SCOPE = 'model-bridge';
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

export function upstreamToken(baseURL: string): string {
  return Buffer.from(baseURL, 'utf8').toString('base64url');
}
function decodeUpstream(token: string): string | null {
  try { return Buffer.from(token, 'base64url').toString('utf8') || null; } catch { return null; }
}

export async function ensureResponsesBridge(): Promise<number> {
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

export function shutdownResponsesBridge(): void {
  try { server?.close(); } catch {  }
  server = null;
  listenPort = 0;
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const m = url.pathname.match(/^\/u\/([^/]+)\/(responses|models)$/);
  if (!m) { res.writeHead(404).end('not found'); return; }
  const upstreamBase = decodeUpstream(m[1]);
  if (!upstreamBase) { res.writeHead(400).end('bad upstream token'); return; }

  if (m[2] === 'models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [], models: [] }));
    return;
  }

  if (req.method !== 'POST') { res.writeHead(405).end('method not allowed'); return; }

  const chunks: Buffer[] = [];
  req.on('data', c => chunks.push(c as Buffer));
  req.on('end', () => {
    let body: any = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
    handleResponses(req, res, upstreamBase, body).catch(err => {
      warn(`handler error: ${err?.message || err}`);
      sendResponsesError(res, `bridge error: ${err?.message || err}`);
    });
  });
}

async function handleResponses(
  req: http.IncomingMessage, res: http.ServerResponse,
  upstreamBase: string, body: any,
): Promise<void> {
  const chatReq = toChatRequest(body);
  const auth = req.headers['authorization'];
  const upstreamUrl = chatCompletionsUrl(upstreamBase);
  log(`-> ${upstreamUrl} model=${chatReq.model} msgs=${chatReq.messages.length} tools=${chatReq.tools?.length ?? 0}`);

  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(auth ? { authorization: Array.isArray(auth) ? auth[0] : auth } : {}),
      },
      body: JSON.stringify(chatReq),
    });
  } catch (e: any) {
    sendResponsesError(res, `upstream fetch failed: ${e?.message || e}`);
    return;
  }

  if (!upstreamResp.ok || !upstreamResp.body) {
    const raw = await upstreamResp.text().catch(() => '');
    warn(`upstream ${upstreamResp.status}: ${raw.slice(0, 300)}`);
    sendResponsesError(res, `upstream ${upstreamResp.status}: ${raw.slice(0, 500)}`);
    return;
  }

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.flushHeaders?.();
  let seq = 0;
  const emit = (type: string, extra: Record<string, unknown>) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify({ type, sequence_number: seq++, ...extra })}\n\n`);
