import crypto from 'node:crypto';
import type http from 'node:http';
import type internal from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { writeScopedLog } from '../core/logging.js';

const rlog = (msg: string) => writeScopedLog('pikichannel', `[rendezvous] ${msg}`, { level: 'info' });

interface Session { client: WebSocket; host: WebSocket; nodeId: string; }

export class RendezvousBroker {
  private wss = new WebSocketServer({ noServer: true });
  private hosts = new Map<string, WebSocket>();
  private sessions = new Map<string, Session>();

  constructor() {
    this.wss.on('connection', (ws: WebSocket) => this.onConnection(ws));
  }

  handleUpgrade(req: http.IncomingMessage, socket: internal.Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
  }

  stop(): void { this.wss.close(); }

  get stats() { return { hosts: this.hosts.size, sessions: this.sessions.size }; }

  private send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === ws.OPEN) { try { ws.send(JSON.stringify(msg)); } catch {  } }
  }
