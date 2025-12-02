import { useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { cn } from '../../utils';
import { api } from '../../api';

export const mdPlugins = [remarkGfm, remarkBreaks];

const isWebUrl = (href: string) => /^https?:\/\//.test(href);
const hasUrlScheme = (href: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(href);

export interface MarkdownRenderOptions {
  workdir?: string | null;
}

function stripLineSuffix(value: string): string {
  return value.replace(/:(\d+)(?::\d+)?$/, '');
}

function stripWrapping(value: string): string {
  let text = value.trim();
  const pairs: Array<[string, string]> = [['`', '`'], ['"', '"'], ["'", "'"], ['<', '>']];
  let changed = true;
  while (changed && text.length >= 2) {
    changed = false;
    for (const [left, right] of pairs) {
      if (text.startsWith(left) && text.endsWith(right)) {
        text = text.slice(left.length, -right.length).trim();
        changed = true;
      }
    }
  }
  return text;
}

function trimFileToken(value: string): { text: string; trailing: string } {
  let text = stripWrapping(value);
  let trailing = '';
  while (text.length > 1) {
    const last = text[text.length - 1];
    if (!last || !/[),.;!?]/.test(last)) break;
    if (last === '.' && /^\.[A-Za-z0-9_-]+$/.test(text)) break;
    trailing = last + trailing;
    text = text.slice(0, -1);
  }
  return { text, trailing };
}

export function isFileLocator(value: string): boolean {
  const text = trimFileToken(value).text;
  if (!text || isWebUrl(text)) return false;
  if (hasUrlScheme(text) && !text.startsWith('file://')) return false;

  const pathPart = stripLineSuffix(text);
  if (!pathPart) return false;
  if (pathPart.startsWith('file://')) return pathPart.length > 'file://'.length;
  if (/^[A-Za-z]:[\\/]/.test(pathPart)) return true;
  if (/^(\/|~\/|\.{1,2}\/)/.test(pathPart)) return pathPart.length > 1;
  if (pathPart.includes('/')) {
    const firstSegment = pathPart.split('/')[0] || '';
    if (/^[A-Za-z0-9-]+\.[A-Za-z]{2,}$/.test(firstSegment)) return false;
