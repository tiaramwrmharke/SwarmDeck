import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  attachAgentImage,
  attachInlineImage,
  materializeImage,
  rewriteAttachmentBlocksForTransport,
  attachmentUrl,
  decodeAttachmentPathParam,
  resolveAllowedAttachmentPath,
} from '../src/agent/images.ts';
import type { MessageBlock } from '../src/agent/types.ts';

const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
  + '890000000a49444154789c63000100000005000156c2c4360000000049454e44ae426082',
  'hex',
);

describe('attachAgentImage', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-img-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inlines small images, uses file:// sentinel above threshold, and returns null for missing files', () => {
    const smallFile = path.join(tmpDir, 'cover.png');
    fs.writeFileSync(smallFile, PNG_BYTES);
    const inlined = attachAgentImage({ imagePath: smallFile, caption: 'swarmdeck cover' });
    expect(inlined).not.toBeNull();
    expect(inlined!.type).toBe('image');
    expect(inlined!.content.startsWith('data:image/png;base64,')).toBe(true);
    expect(inlined!.imagePath).toBe(smallFile);
    expect(inlined!.imageMime).toBe('image/png');
    expect(inlined!.imageCaption).toBe('swarmdeck cover');

    const bigFile = path.join(tmpDir, 'big.png');
    fs.writeFileSync(bigFile, PNG_BYTES);
    const sentinel = attachAgentImage({ imagePath: bigFile, inlineThresholdBytes: 1 });
    expect(sentinel).not.toBeNull();
    expect(sentinel!.content).toBe(`file://${bigFile}`);
    expect(sentinel!.imagePath).toBe(bigFile);

    expect(attachAgentImage({ imagePath: path.join(tmpDir, 'missing.png') })).toBeNull();
  });
});

describe('attachInlineImage', () => {
  it('persists when requested, inlines as data URL otherwise, and rejects non-image MIME types', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-img-test-'));
    const homeSnapshot = process.env.HOME;
    process.env.HOME = tmp;
    try {
