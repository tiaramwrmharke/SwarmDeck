import WebSocket from 'ws';
import { writeScopedLog } from '../core/logging.js';
import type { ChannelConnection } from './transport.js';
import { createAnswerer, type Answerer, type SignalData } from './transports/webrtc-shared.js';

const rlog = (msg: string) => writeScopedLog('pikichannel', `[rendezvous-host] ${msg}`, { level: 'info' });

export class RendezvousHostClient {
  private ws: WebSocket | null = null;
  private answerers = new Map<string, Answerer>();
  private adopted = new Set<string>();
  private stopped = false;
  private reconnectDelay = 1000;

  constructor(
    private readonly url: string,
    private readonly nodeId: string,
    private readonly onConnection: (conn: ChannelConnection) => void,
  ) {}

  start(): void { this.stopped = false; this.connect(); }

  stop(): void {
    this.stopped = true;
    const ws = this.ws; this.ws = null;
    try { ws?.close(); } catch {  }
    for (const a of this.answerers.values()) a.close();
    this.answerers.clear();
