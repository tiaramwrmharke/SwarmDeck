import type { ClientMessage, ServerMessage } from './protocol.js';

export type WireFormat = 'json';

export const DEFAULT_WIRE_FORMAT: WireFormat = 'json';

export function encodeServer(msg: ServerMessage, _fmt: WireFormat = DEFAULT_WIRE_FORMAT): string {
  return JSON.stringify(msg);
}

export function encodeClient(msg: ClientMessage, _fmt: WireFormat = DEFAULT_WIRE_FORMAT): string {
  return JSON.stringify(msg);
}
