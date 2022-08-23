import type { Agent, ChatId, StreamPreviewMeta, StreamPreviewPlan } from '../../bot/bot.js';
import { hasPreviewMeta, samePreviewMeta, samePreviewPlan } from '../../bot/streaming.js';
import type { StreamPreviewRenderInput } from '../../bot/render-shared.js';
import { STREAM_PREVIEW_TIMEOUTS } from '../../core/constants.js';

const STREAM_PREVIEW_HEARTBEAT_MS = STREAM_PREVIEW_TIMEOUTS.heartbeat;
const STREAM_TYPING_HEARTBEAT_MS = STREAM_PREVIEW_TIMEOUTS.typing;
const STREAM_STALLED_NOTICE_MS = STREAM_PREVIEW_TIMEOUTS.stalledNotice;

export interface PreviewChannel {
  editMessage(chatId: ChatId, messageId: number | string, text: string, opts?: { parseMode?: string; keyboard?: any }): Promise<void>;
  sendTyping(chatId: ChatId, opts?: { messageThreadId?: number }): Promise<void>;
}

export interface LivePreviewRenderer {
  renderInitial(agent: Agent, model?: string | null, effort?: string | null): string;
  renderStream(input: StreamPreviewRenderInput): string;
}

export interface LivePreviewOptions {
  agent: Agent;
  chatId: ChatId;
  placeholderMessageId: number | string | null;
  channel: PreviewChannel;
  renderer: LivePreviewRenderer;
  streamEditIntervalMs: number;
  startTimeMs: number;
  canEditMessages: boolean;
  canSendTyping: boolean;
  messageThreadId?: number;
  parseMode?: string;
  keyboard?: any;
  model?: string | null;
  effort?: string | null;
  log?: (message: string) => void;
}

export class LivePreview {
  readonly initialText: string;

  private readonly agent: Agent;
  private readonly chatId: ChatId;
  private readonly placeholderMessageId: number | string | null;
  private readonly channel: PreviewChannel;
  private readonly renderer: LivePreviewRenderer;
  private readonly streamEditIntervalMs: number;
  private readonly startTimeMs: number;
  private readonly canEditMessages: boolean;
  private readonly canSendTyping: boolean;
  private readonly messageThreadId?: number;
  private readonly parseMode: string;
