export type ChannelHealthLogLevel = 'info' | 'warn' | 'error';
export type ChannelHealthLogger = (msg: string, level: ChannelHealthLogLevel) => void;

export interface ChannelHealthOpts {
  label: string;
  opAction: string;
  initialDelayMs: number;
  maxDelayMs: number;
  log: ChannelHealthLogger;
  sustainedThresholdMs?: number;
  sustainedFailureHint?: string;
  transientFailureLevel?: ChannelHealthLogLevel;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

export class ChannelHealth {
  private readonly label: string;
  private readonly opAction: string;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly log: ChannelHealthLogger;
  private readonly sustainedThresholdMs: number;
  private readonly sustainedFailureHint: string;
