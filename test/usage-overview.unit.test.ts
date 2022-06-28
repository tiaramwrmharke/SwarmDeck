import { describe, it, expect } from 'vitest';
import { buildUsageOverviewLines, formatUsageWindowsSummary, oldestUsageCapturedAt } from '../src/bot/render-shared.ts';
import type { UsageOverview } from '../src/bot/commands.ts';
import type { UsageResult } from '../src/agent/types.ts';

function usage(windows: Array<[string, number]>): UsageResult {
  return {
    ok: true,
    agent: 'claude',
    source: 'ratelimit-headers',
    capturedAt: '2026-06-30T00:00:00.000Z',
    status: 'allowed',
    windows: windows.map(([label, usedPercent]) => ({
      label, usedPercent, remainingPercent: 100 - usedPercent, resetAt: null, resetAfterSeconds: null,
      status: usedPercent >= 80 ? 'warning' : 'allowed',
    })),
    error: null,
  };
}

const unavailable: UsageResult = {
  ok: false, agent: 'claude', source: null, capturedAt: null, status: null, windows: [], error: 'boom',
};

// Fixed "now" = 5 minutes after the usage() capturedAt, so the freshness stamp is deterministic.
const NOW = Date.parse('2026-06-30T00:05:00.000Z');
const texts = (o: UsageOverview) => buildUsageOverviewLines(o, NOW).map(l => l.text);

describe('formatUsageWindowsSummary', () => {
  it('joins windows compactly and rounds percents', () => {
    expect(formatUsageWindowsSummary(usage([['5h', 42.4], ['7d', 18.6]]))).toBe('5h 42% · 7d 19%');
  });
  it('adds per-window reset countdowns, preferring resetAt over stale resetAfterSeconds', () => {
    const u = usage([['5h', 42.4], ['7d', 100]]);
    u.windows[0].resetAt = '2026-06-30T01:35:00.000Z';
    u.windows[0].resetAfterSeconds = 0;
    u.windows[1].resetAfterSeconds = 3600;
    expect(formatUsageWindowsSummary(u, NOW)).toBe('5h 42% (reset 1h30m) · 7d 100% (reset 1h)');
  });
  it('shows reset now once the reset instant has elapsed', () => {
    const u = usage([['5h', 100]]);
    u.windows[0].resetAt = '2026-06-30T00:04:00.000Z';
    expect(formatUsageWindowsSummary(u, NOW)).toBe('5h 100% (reset now)');
  });
  it('keeps reset time when telemetry has status but no percent', () => {
    const u = usage([]);
    u.status = 'warning';
    u.windows = [{
      label: '<1m ago',
      usedPercent: null,
      remainingPercent: null,
      resetAt: '2026-06-30T02:05:00.000Z',
      resetAfterSeconds: null,
      status: 'warning',
    }];
