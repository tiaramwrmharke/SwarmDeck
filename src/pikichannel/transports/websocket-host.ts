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
