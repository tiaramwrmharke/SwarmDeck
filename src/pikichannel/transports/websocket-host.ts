import type http from 'node:http';
import type internal from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { BaseConnection, type ChannelConnection, type ChannelTransport } from '../transport.js';

const WS_KEEPALIVE_MS = 25_000;
let connCounter = 0;

class WsConnection extends BaseConnection {
  readonly id: string;
  readonly kind = 'websocket';

  constructor(private readonly ws: WebSocket, remote?: string) {
    super();
    this.id = `ws-${++connCounter}`;
    this.remote = remote;

    ws.on('message', (raw) => {
      const data = raw as unknown;
      const frame = typeof data === 'string'
        ? data
        : Buffer.isBuffer(data)
          ? data.toString('utf8')
          : Array.isArray(data)
            ? Buffer.concat(data as Buffer[]).toString('utf8')
            : Buffer.from(data as ArrayBuffer).toString('utf8');
      this.emitMessage(frame);
    });
    ws.on('close', () => this.emitClose());
    ws.on('error', () => this.emitClose());
  }

  send(frame: string): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(frame);
