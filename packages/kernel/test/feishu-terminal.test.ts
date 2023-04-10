import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import { FeishuSurface, type FeishuTransport, type InboundFeishuMessage } from '../examples/feishu-terminal.js';

// Fake Lark transport: records create/patch calls, lets the test inject inbound events.
class FakeFeishuTransport implements FeishuTransport {
  sent: Array<{ chatId: string; id: string; text: string }> = [];
  edits: Array<{ id: string; text: string }> = [];
  private cb?: (m: InboundFeishuMessage) => void;
  onMessage(cb: (m: InboundFeishuMessage) => void): void { this.cb = cb; }
  async send(chatId: string, text: string): Promise<string> { const id = `m${this.sent.length + 1}`; this.sent.push({ chatId, id, text }); return id; }
  async edit(id: string, text: string): Promise<void> { this.edits.push({ id, text }); }
  inbound(chatId: string, text: string): void { this.cb?.({ chatId, text, messageId: `in-${Date.now()}` }); }
  rendered(): string[] { return [...this.sent.map(s => s.text), ...this.edits.map(e => e.text)]; }
}

const waitFor = async (pred: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 5)); }
