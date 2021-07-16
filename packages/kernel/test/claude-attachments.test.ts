import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeDriver, claudeUserMessage } from '../src/drivers/claude.js';
import type { DriverContext, DriverEvent } from '../src/contracts/driver.js';

// Minimal valid PNG (1x1) so attachments are real, readable image files.
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
  + '890000000a49444154789c63000100000005000156c2c4360000000049454e44ae426082',
  'hex',
);

describe('claudeUserMessage (kernel)', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-claude-att-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('inlines an image attachment as a base64 image block alongside the prompt text', () => {
    const png = path.join(tmp, 'shot.png');
    fs.writeFileSync(png, PNG_BYTES);
    const msg = JSON.parse(claudeUserMessage('look at this', [png]));
    expect(msg.type).toBe('user');
    const content = msg.message.content;
    const image = content.find((b: any) => b.type === 'image');
    expect(image).toBeTruthy();
    expect(image.source.type).toBe('base64');
    expect(image.source.media_type).toBe('image/png');
    expect(image.source.data).toBe(PNG_BYTES.toString('base64'));
    // the prompt text rides as the final text block
    expect(content[content.length - 1]).toEqual({ type: 'text', text: 'look at this' });
  });

  it('maps jpg/jpeg/gif/webp to their media types', () => {
    for (const [name, mime] of [['a.jpg', 'image/jpeg'], ['a.jpeg', 'image/jpeg'], ['a.gif', 'image/gif'], ['a.webp', 'image/webp']] as const) {
      const p = path.join(tmp, name);
      fs.writeFileSync(p, PNG_BYTES);
      const content = JSON.parse(claudeUserMessage('x', [p])).message.content;
      expect(content.find((b: any) => b.type === 'image').source.media_type).toBe(mime);
    }
  });

  it('represents a non-image / unreadable file as a text note, never crashing', () => {
    const pdf = path.join(tmp, 'doc.pdf');
