export type ConnMode = 'local' | 'direct' | 'remote';

export interface Endpoint {
  mode: ConnMode;
  host?: string;
  rendezvous?: string;
  nodeId?: string;
  token?: string;
}

const K = { host: 'pikichannel.host', token: 'pikichannel.token', rdv: 'pikichannel.rendezvous', node: 'pikichannel.node' };

let cached: Endpoint | null | undefined;

function read(k: string): string { try { return (localStorage.getItem(k) || '').trim(); } catch { return ''; } }
function write(k: string, v: string | undefined): void { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {  } }

export function getEndpoint(): Endpoint | null {
  if (cached !== undefined) return cached;
  cached = resolve();
  return cached;
}

function resolve(): Endpoint | null {
