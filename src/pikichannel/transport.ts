import type { TransportKind } from './protocol.js';

export interface ChannelConnection {
  readonly id: string;
  readonly kind: TransportKind;
  readonly remote?: string;
  send(frame: string): void;
  onMessage(cb: (frame: string) => void): void;
  onClose(cb: () => void): void;
  isOpen(): boolean;
  close(): void;
}

export interface ChannelTransport {
  readonly kind: TransportKind;
  start(onConnection: (conn: ChannelConnection) => void): void;
  stop(): void;
}

export abstract class BaseConnection implements ChannelConnection {
  abstract readonly id: string;
  abstract readonly kind: TransportKind;
  remote?: string;

