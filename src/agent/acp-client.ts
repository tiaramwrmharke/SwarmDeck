import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { agentLog, agentWarn } from './utils.js';

export interface AcpClientOptions {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

type IncomingMessage = JsonRpcResponse | JsonRpcNotification | JsonRpcRequest;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  method: string;
};

export function toAcpMcpServers(servers: Record<string, any> | undefined): any[] {
  if (!servers) return [];
  const out: any[] = [];
  for (const [name, cfg] of Object.entries(servers)) {
    if (!cfg || typeof cfg !== 'object') continue;
    const type = String(cfg.type || '').toLowerCase();
    if ((type === 'http' || type === 'sse') && cfg.url) {
      const headers = Object.entries(cfg.headers || {}).map(([n, v]) => ({ name: n, value: String(v) }));
      out.push({ type, name, url: String(cfg.url), headers });
      continue;
    }
    if (cfg.command) {
      const env = Object.entries(cfg.env || {}).map(([n, v]) => ({ name: n, value: String(v) }));
      out.push({
        name,
        command: String(cfg.command),
        args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
        env,
      });
    }
  }
  return out;
}

export class AcpClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
