import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

// One newline-delimited JSON-RPC client over a child process' stdio — the shared wire
// under both `codex app-server` and every ACP agent. Driver-internal (not exported by
// any barrel); the drivers own the protocol on top (initialize handshakes, methods).

export type RpcMsg = { jsonrpc?: string; id?: number | string; method?: string; params?: any; result?: any; error?: any };

/** Throw from an onRequest handler to answer with a specific JSON-RPC error code. */
export class RpcError extends Error {
  constructor(readonly code: number, message: string) { super(message); }
}

export interface StdioRpcOptions {
  command: string;
  args: string[];
  env?: Record<string, string>;   // merged over process.env
  cwd?: string;
  label?: string;                 // name used in error messages; defaults to command
}

const STDERR_TAIL_LINES = 20;

export class StdioRpcClient {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, (m: RpcMsg) => void>();
  private notifyCb?: (method: string, params: any) => void;
  private requestCb?: (method: string, params: any, id: number | string) => any | Promise<any>;
  private closeCb?: () => void;
  private readonly stderrTail: string[] = [];
  private readonly label: string;

  constructor(private readonly opts: StdioRpcOptions) {
