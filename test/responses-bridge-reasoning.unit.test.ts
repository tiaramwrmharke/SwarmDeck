import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { ensureResponsesBridge, shutdownResponsesBridge, upstreamToken } from '../src/model/responses-bridge.js';

// Spin up a fake chat-completions upstream that streams the given SSE lines, run it through
// the real responses-bridge, and collect the Responses events the bridge emits. This guards
// the Chat→Responses streaming translation — in particular that a thinking model's reasoning
// (delta.reasoning_content / delta.reasoning) is forwarded LIVE as reasoning-summary events
// instead of being dropped (which made the whole thinking phase silent).

let upstream: http.Server | null = null;

afterEach(() => {
  shutdownResponsesBridge();
  try { upstream?.close(); } catch { /* ignore */ }
  upstream = null;
});

async function runBridge(sseLines: string[]): Promise<Array<{ type: string; data: any }>> {
  upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const l of sseLines) res.write(`data: ${l}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
  await new Promise<void>(r => upstream!.listen(0, '127.0.0.1', () => r()));
  const upstreamBase = `http://127.0.0.1:${(upstream!.address() as any).port}/v1`;

  const port = await ensureResponsesBridge();
  const url = `http://127.0.0.1:${port}/u/${upstreamToken(upstreamBase)}/responses`;
