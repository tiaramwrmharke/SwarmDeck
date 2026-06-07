import { RTCPeerConnection, type RTCDataChannel } from 'werift';
import { BaseConnection, type ChannelConnection } from '../transport.js';
import { getCachedIceServers, toWeriftIceServers, type IceServer } from '../turn.js';

let connCounter = 0;

export function getIceServers(): IceServer[] {
  return toWeriftIceServers(getCachedIceServers());
}

function coerceFrame(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  try { return Buffer.from(new Uint8Array(data as ArrayBuffer)).toString('utf8'); } catch { return String(data); }
}

export class RtcConnection extends BaseConnection {
  readonly id: string;
  readonly kind = 'webrtc';

  constructor(private readonly channel: RTCDataChannel, private readonly pc: RTCPeerConnection, remote?: string) {
    super();
    this.id = `rtc-${++connCounter}`;
    this.remote = remote || 'webrtc-peer';
