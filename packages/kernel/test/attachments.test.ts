import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  MAX_IMAGE_EDGE,
  imageDimensions,
  normalizeImageAttachments,
  resetResizerForTest,
} from '../src/attachments.js';

// A real, decodable PNG (solid color, RGBA, no interlace) — sips/ImageMagick can resize it.
function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdrBody = Buffer.alloc(13);
  ihdrBody.writeUInt32BE(width, 0);
  ihdrBody.writeUInt32BE(height, 4);
  ihdrBody[8] = 8; ihdrBody[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(height * (1 + width * 4)); // per row: filter byte 0 + pixels
  for (let y = 0; y < height; y++) raw.fill(0x7f, y * (1 + width * 4) + 1, (y + 1) * (1 + width * 4));
  const chunk = (type: string, body: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length, 0);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(typed), 0);
    return Buffer.concat([len, typed, crc]);
  };
  return Buffer.concat([sig, chunk('IHDR', ihdrBody), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Whether THIS machine can actually resize (darwin sips, or ImageMagick on PATH).
const canResize = process.platform === 'darwin'
  || ['magick', 'convert'].some((c) => {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
  });

describe('imageDimensions', () => {
  it('reads PNG headers', () => {
    expect(imageDimensions(makePng(2692, 410))).toEqual({ width: 2692, height: 410 });
  });
