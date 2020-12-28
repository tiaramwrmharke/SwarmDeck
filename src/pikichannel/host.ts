import {
  PROTOCOL_VERSION,
  diffSnapshot,
  type ClientMessage,
  type HostCapability,
  type SessionMeta,
  type ServerMessage,
  type SnapshotPatch,
  type TransportKind,
  type UniversalSnapshot,
} from './protocol.js';
import { encodeServer, decodeClient } from './codec.js';
import type { ChannelConnection } from './transport.js';

export interface PromptCommand {
  sessionKey?: string;
  prompt: string;
  agent?: string;
  workdir?: string;
  model?: string | null;
  effort?: string | null;
  workflow?: boolean;
  attachments?: string[];
}

export interface CommandResult {
  ok: boolean;
  sessionKey?: string;
  taskId?: string;
  error?: string;
}

export type Authenticator = (token: string | undefined, remote: string | undefined) => boolean;

export interface SessionSource {
  hostInfo(): { name: string; version: string; capabilities: HostCapability[]; authRequired?: boolean };
  listSessions(): SessionMeta[];
  getSnapshot(sessionKey: string): { snapshot: UniversalSnapshot; seq: number } | null;
  onUpdate(cb: (sessionKey: string, snapshot: UniversalSnapshot, seq: number) => void): () => void;
  onSessionsChanged(cb: (sessions: SessionMeta[]) => void): () => void;

  prompt(cmd: PromptCommand): Promise<CommandResult>;
  stop(sessionKey: string): CommandResult;
  steer(taskId: string): Promise<CommandResult>;
  recall(taskId: string): CommandResult;
  interact(promptId: string, action: 'select' | 'text' | 'skip' | 'cancel', value?: string, requestFreeform?: boolean): CommandResult;
  handleRequest?(req: TunnelRequest): Promise<TunnelResponse>;
}

export interface TunnelRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  encoding?: 'utf8' | 'base64';
}

export interface TunnelResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  encoding?: 'utf8' | 'base64';
}

const SUBSCRIBE_ALL = '*';

interface Peer {
  conn: ChannelConnection;
  subs: Set<string>;
  authed: boolean;
}

export class PikichannelHost {
