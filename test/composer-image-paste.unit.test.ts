import { describe, expect, it } from 'vitest';
import {
  isLikelyImageFile,
  extractImageDataUrlsFromHtml,
  dataUrlToImageFile,
} from '../dashboard/src/pages/sessions/utils.ts';

// 1x1 transparent PNG
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('isLikelyImageFile', () => {
  it('accepts files whose MIME type is an image', () => {
    expect(isLikelyImageFile(new File([], 'a.png', { type: 'image/png' }))).toBe(true);
    expect(isLikelyImageFile(new File([], 'a', { type: 'image/webp' }))).toBe(true);
  });

