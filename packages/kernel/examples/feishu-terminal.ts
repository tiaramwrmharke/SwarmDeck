// Reference IM terminal: Feishu (Lark) as a `Surface` over `LoomIO`.
//
// Proves the upper-seam claim "IM is just a Surface": inbound Feishu text -> io.prompt,
// kernel snapshot stream -> create/edit a Feishu message (streaming, edit-in-place).
//
// The adapter is PURE — it depends on an injected `FeishuTransport`, so the pipeline is
// hermetically testable (fake transport) and the kernel package carries no Lark dep.
// The real transport (im.v1.message.create / .patch + EventDispatcher) is a thin wrapper;
// see feishu-lark-transport.ts.
import type { LoomIO, Surface } from '../src/index.js';
import type { UniversalSnapshot } from '../src/index.js';

export interface InboundFeishuMessage { chatId: string; text: string; messageId: string }

export interface FeishuTransport {
  connect?(): Promise<void>;
  onMessage(cb: (m: InboundFeishuMessage) => void): void;
  send(chatId: string, text: string): Promise<string>;   // returns feishu message id
  edit(messageId: string, text: string): Promise<void>;   // patch-in-place
  disconnect?(): void;
}

interface ChatBinding { chatId: string; msgId: string | null; lastText: string; latest: UniversalSnapshot | null; busy: boolean }

export class FeishuSurface implements Surface {
  readonly id = 'feishu';
  readonly capabilities = { editMessages: true, images: false, buttons: true };

  private io?: LoomIO;
  private unsub?: () => void;
  private readonly bySession = new Map<string, ChatBinding>();
