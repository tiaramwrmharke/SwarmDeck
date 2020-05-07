import os from 'node:os';
import path from 'node:path';
import which from 'which';

export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';
export const IS_LINUX = process.platform === 'linux';

export function getHome(): string {
