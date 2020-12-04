import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PROTOCOL_VERSION, type ClientMessage, type ServerMessage, type SnapshotPatch,
  type HostInfo, isClientMessage,
} from '../protocol/index.js';
import type { LoomIO, Surface, SurfaceCapabilities, TuiHost, PtyHandle } from '../contracts/surface.js';
import { randomUUID } from 'node:crypto';

interface Peer { ws: WebSocket; subs: Set<string>; authed: boolean; ptys: Map<string, PtyHandle>; }
const SUBSCRIBE_ALL = '*';

export interface WebSurfaceOptions {
  port?: number;          // omit/0 => OS-assigned ephemeral (read back via .port)
  server?: http.Server;   // attach to an existing http server instead
  token?: string;         // if set, clients must present it in hello
  name?: string;
  allowTui?: boolean;     // gate Lane R (raw PTY); default true when a TuiHost is present
  access?: {              // AccessPolicy: capability scoping for this host (default all allowed)
    prompt?: boolean;     // false => deny structured turns (read-only observer)
    tui?: boolean;        // false => deny opening a raw PTY
    tuiReadonly?: boolean;// true  => stream PTY output but drop client keystrokes (spectator)
  };
}

// The built-in Web/remote terminal: a ws host speaking the UniversalSnapshot wire
// protocol over LoomIO. Any pikichannel client (incl. the existing swarmdeck dashboard
// SPA) can connect: hello -> subscribe -> receive `session` patches -> prompt/stop/steer.
export class WebSurface implements Surface {
  readonly id = 'web';
  readonly capabilities: SurfaceCapabilities = { tunnel: true, images: true, buttons: true, editMessages: true };

  private wss?: WebSocketServer;
  private io?: LoomIO;
  private host?: TuiHost;
  private unsub?: () => void;
  private unsubSessions?: () => void;
  private readonly peers = new Set<Peer>();

