import { describe, it, expect } from 'vitest';
import { buildClaudeOAuthUsage } from '../src/agent/drivers/claude.ts';
import { codexUsageFromRateLimits, codexUsageFromLiveRateLimitsResult } from '../src/agent/drivers/codex.ts';
import { labelFromWindowMinutes, normalizeUsageStatus } from '../src/agent/utils.ts';

// Real payloads captured 2026-07-06 from api.anthropic.com /api/oauth/usage and
// codex-cli 0.142.4 (app-server account/rateLimits/read + session-history event_msg).
// These pin the CURRENT upstream schemas; the legacy fixtures pin the fallback path.

const CLAUDE_OAUTH_2026 = {
  five_hour: { utilization: 3.0, resets_at: '2026-07-06T18:40:00.231467+00:00', limit_dollars: null, used_dollars: null, remaining_dollars: null },
  seven_day: { utilization: 0.0, resets_at: '2026-07-13T12:00:00.231490+00:00', limit_dollars: null, used_dollars: null, remaining_dollars: null },
  seven_day_oauth_apps: null,
  seven_day_opus: null,
  seven_day_sonnet: null,
  extra_usage: {
    is_enabled: true, monthly_limit: 50000, used_credits: 10161.0, utilization: 20.322,
    currency: 'USD', decimal_places: 2, disabled_reason: null, daily: null, weekly: null,
  },
  limits: [
    { kind: 'session', group: 'session', percent: 3, severity: 'normal', resets_at: '2026-07-06T18:40:00.231467+00:00', scope: null, is_active: true },
    { kind: 'weekly_all', group: 'weekly', percent: 0, severity: 'normal', resets_at: '2026-07-13T12:00:00.231490+00:00', scope: null, is_active: false },
    { kind: 'weekly_scoped', group: 'weekly', percent: 0, severity: 'normal', resets_at: '2026-07-13T12:00:00.231798+00:00', scope: { model: { id: null, display_name: 'Fable' }, surface: null }, is_active: false },
  ],
  spend: {
    used: { amount_minor: 10161, currency: 'USD', exponent: 2 },
    limit: { amount_minor: 50000, currency: 'USD', exponent: 2 },
    percent: 20, severity: 'normal', enabled: true, disabled_reason: null,
    cap: { money: null, credits: { amount_minor: 50000, exponent: 2 } },
    balance: null, auto_reload: null, disclaimer: 'Usage credits …', can_purchase_credits: false, can_toggle: false,
  },
  member_dashboard_available: false,
};

const CLAUDE_OAUTH_LEGACY = {
  five_hour: { utilization: 42.4, resets_at: '2026-07-06T18:00:00.000000+00:00' },
  seven_day: { utilization: 18.6, resets_at: '2026-07-13T12:00:00.000000+00:00' },
  seven_day_opus: { utilization: 55.0, resets_at: '2026-07-13T12:00:00.000000+00:00' },
  seven_day_sonnet: null,
  extra_usage: { is_enabled: true, monthly_limit: 50000, used_credits: 0, utilization: 0, currency: 'USD', decimal_places: 2 },
};

describe('buildClaudeOAuthUsage (2026 limits[] schema)', () => {
  it('parses every limits[] window including the model-scoped weekly one', () => {
    const usage = buildClaudeOAuthUsage(CLAUDE_OAUTH_2026)!;
    expect(usage.ok).toBe(true);
    expect(usage.source).toBe('oauth-api');
    expect(usage.windows.map(w => w.label)).toEqual(['5h', '7d', '7d Fable', 'Extra']);
    expect(usage.windows[0].usedPercent).toBe(3);
    expect(usage.windows[0].status).toBe('allowed');
    expect(usage.windows[0].resetAt).toBe('2026-07-06T18:40:00.231467+00:00');
    expect(usage.windows[2].usedPercent).toBe(0);
    expect(usage.status).toBe('allowed');
  });

  it('keeps the Extra credit spend as a dollar detail', () => {
    const usage = buildClaudeOAuthUsage(CLAUDE_OAUTH_2026)!;
