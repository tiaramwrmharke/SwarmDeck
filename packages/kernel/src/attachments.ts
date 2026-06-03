import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path, { extname } from 'node:path';

// Attachment vocabulary + normalization, shared by the runtime (Hub) and every driver.
// NOT part of the public API — nothing here is re-exported by any barrel.

// Every driver inlines the same image formats (the Anthropic vision set, which the
// others accept too) and notes non-image files the same way.
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
};

/** Mime type when the file is an inlineable image, else null. */
export function imageMimeForFile(filePath: string): string | null {
  return IMAGE_MIME_BY_EXT[extname(filePath).toLowerCase()] ?? null;
}

/** The text note substituted for a non-image attachment. */
export function attachedFileNote(filePath: string): string {
  return `[Attached file: ${filePath}]`;
}

/**
 * Anthropic scales any image whose long edge exceeds 1568px before the model sees it, and —
 * once a single request carries MORE THAN 20 images — outright REJECTS any image over 2000px
 * on a side ("dimensions exceed max allowed size for many-image requests"). A long session
 * full of screenshots easily crosses 20 images, at which point one freshly attached (or
 * mid-turn steered) full-resolution screenshot gets the whole image stripped from the turn.
 * Capping the long edge at Anthropic's own downscale threshold loses no detail the model
 * would have kept and makes the many-image rejection unreachable. Other providers only gain
 * from smaller uploads.
 */
export const MAX_IMAGE_EDGE = 1568;

/**
 * Pixel dimensions parsed from an image buffer's header (PNG / JPEG / GIF / WebP),
 * or null when the bytes aren't one of those formats. Header-only: never decodes.
 */
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
