import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: execSyncMock,
  };
});

vi.mock('../src/core/platform.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/core/platform.ts')>();
  return {
    ...actual,
    IS_MAC: true,
  };
});

describe('Claude API retry classification', () => {
  it('retries transient overloads but not quota/rate-limit exhaustion', async () => {
    const { isRetryableClaudeApiError } = await import('../src/agent/utils.ts');
    expect(isRetryableClaudeApiError('Overloaded')).toBe(true);
    expect(isRetryableClaudeApiError('Gateway timeout 504')).toBe(true);
    expect(isRetryableClaudeApiError('Rate limit exceeded')).toBe(false);
    expect(isRetryableClaudeApiError('Usage limit reached')).toBe(false);
    expect(isRetryableClaudeApiError('session limit resets later')).toBe(false);
  });
});

describe('Claude -p driver — selected-model-unavailable surfaces as a non-retryable error', () => {
  it('records s.errors + model_error stopReason from the <synthetic> model_not_found event', async () => {
    const { createClaudeStreamState, claudeParse } = await import('../src/agent/drivers/claude.ts');
    const s = createClaudeStreamState({
      agent: 'claude', prompt: '你好', workdir: '/tmp', timeout: 60,
      sessionId: null, model: 'claude-fable-5', thinkingEffort: 'high',
      onText: () => {},
    } as any);
    claudeParse({
      type: 'assistant',
      error: 'model_not_found',
      message: {
        model: '<synthetic>',
        content: [{ type: 'text', text: "There's an issue with the selected model (claude-fable-5). It may not exist or you may not have access to it." }],
      },
    }, s);
    expect(s.stopReason).toBe('model_error');
    expect(Array.isArray(s.errors) && s.errors.length > 0).toBe(true);
    expect(String(s.errors[0])).toContain('(claude-fable-5)');
    expect(String(s.errors[0]).toLowerCase()).toContain('unavailable');
    claudeParse({
      type: 'result', is_error: true, api_error_status: 404, stop_reason: 'stop_sequence',
      result: "There's an issue with the selected model (claude-fable-5).", session_id: 'sess-1',
    }, s);
    expect(s.stopReason).toBe('model_error');
    expect(String(s.errors[0])).toContain('(claude-fable-5)');
  });
});

describe('Claude -p driver — live thinking-token estimates (system/thinking_tokens)', () => {
  it('ticks the preview turn output + context during silent thinking, superseded by real usage', async () => {
    const { createClaudeStreamState, claudeParse } = await import('../src/agent/drivers/claude.ts');
    const { buildStreamPreviewMeta } = await import('../src/agent/utils.ts');
    const s = createClaudeStreamState({
      agent: 'claude', prompt: 'hi', workdir: '/tmp', timeout: 60,
      sessionId: null, model: 'claude-opus-4-8', thinkingEffort: 'high',
      onText: () => {},
    } as any);
    claudeParse({ type: 'system', session_id: 'sess-tt', model: 'claude-opus-4-8' }, s);
    claudeParse({ type: 'stream_event', event: { type: 'message_start', message: { usage: { input_tokens: 50_000, cache_read_input_tokens: 10_000 } } } }, s);
    // prompt-side counts are visible immediately, before any output
    expect(buildStreamPreviewMeta(s).contextPercent).toBe(6.2);
    // silent extended thinking: only the CLI's estimates arrive (no thinking_delta, no usage)
    claudeParse({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 50, estimated_tokens_delta: 50 }, s);
    claudeParse({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 200, estimated_tokens_delta: 150 }, s);
    const live = buildStreamPreviewMeta(s);
    expect(live.turnOutputTokens).toBe(200);
    expect(live.contextUsedTokens).toBe(60_200);
    expect(s.outputTokens).toBe(0); // the raw reported output stays untouched by the estimate
    // the settling message_delta reports real output (already includes thinking): supersede, don't add
    claudeParse({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 120 } } }, s);
    const settled = buildStreamPreviewMeta(s);
    expect(settled.turnOutputTokens).toBe(120);
    expect(settled.contextUsedTokens).toBe(60_120);
  });
});

describe('Claude usage resolution', () => {
  const originalHome = process.env.HOME;
  let homeDir = '';

  beforeEach(() => {
    vi.resetModules();
    execSyncMock.mockReset();
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-claude-usage-'));
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it('falls through to telemetry when OAuth fails and generates age-based labels', async () => {
    {
      const telemetryDir = path.join(homeDir, '.claude', 'telemetry');
      fs.mkdirSync(telemetryDir, { recursive: true });
      fs.writeFileSync(path.join(telemetryDir, 'events.json'), JSON.stringify({
        event_type: 'ClaudeCodeInternalEvent',
        event_data: {
          event_name: 'tengu_claudeai_limits_status_changed',
          client_timestamp: new Date(Date.now() - 60_000).toISOString(),
          model: 'claude-opus-4-7',
          additional_metadata: JSON.stringify({ status: 'allowed_warning', hoursTillReset: 39 }),
        },
