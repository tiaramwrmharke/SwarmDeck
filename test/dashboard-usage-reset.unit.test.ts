import { describe, it, expect } from 'vitest';
import { resetDisplay } from '../dashboard/src/usage.ts';
import type { UsageWindowInfo } from '../dashboard/src/types.ts';

function window(over: Partial<UsageWindowInfo>): UsageWindowInfo {
  return {
    label: '5h',
    usedPercent: 100,
    remainingPercent: 0,
    resetAt: null,
    resetAfterSeconds: null,
