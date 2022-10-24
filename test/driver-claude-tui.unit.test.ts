import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withEnv } from './support/env.ts';

describe('isClaudePrintModeForced — TUI is now the default; only opt-out flips it', () => {
  let module: typeof import('../src/agent/drivers/claude.ts');

  beforeEach(async () => {
    vi.resetModules();
    module = await import('../src/agent/drivers/claude.ts');
  });

  it('default false / PRINT truthy true / legacy TUI off true / legacy TUI=1 no-op', async () => {
    await withEnv({ PIKILOOM_CLAUDE_PRINT: undefined, PIKILOOM_CLAUDE_TUI: undefined }, () => {
      expect(module.isClaudePrintModeForced()).toBe(false);
    });
    await withEnv({ PIKILOOM_CLAUDE_PRINT: '', PIKILOOM_CLAUDE_TUI: '' }, () => {
      expect(module.isClaudePrintModeForced()).toBe(false);
    });

    for (const v of ['1', 'true', 'yes', 'on', 'TRUE', 'Yes', ' 1 ']) {
      await withEnv({ PIKILOOM_CLAUDE_PRINT: v, PIKILOOM_CLAUDE_TUI: undefined }, () => {
        expect(module.isClaudePrintModeForced()).toBe(true);
      });
    }

    for (const v of ['0', 'false', 'no', 'off', 'FALSE', 'No', ' off ']) {
      await withEnv({ PIKILOOM_CLAUDE_PRINT: undefined, PIKILOOM_CLAUDE_TUI: v }, () => {
        expect(module.isClaudePrintModeForced()).toBe(true);
      });
    }

    await withEnv({ PIKILOOM_CLAUDE_PRINT: undefined, PIKILOOM_CLAUDE_TUI: '1' }, () => {
      expect(module.isClaudePrintModeForced()).toBe(false);
    });
  });
});

describe('Claude TUI driver — startup-failure fallback contract', () => {
  let tmpDir: string;
  const onText = vi.fn();

  beforeEach(() => {
    onText.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-claude-tui-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('throws (not returns) when pty.spawn cannot find the claude binary — lets the dispatcher fall back to -p', async () => {
    const isolatedPath = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-no-claude-'));
    const { doClaudeTuiStream } = await import('../src/agent/drivers/claude-tui.ts');
    try {
      let thrown: any = null;
      let result: any = null;
      try {
        result = await Promise.race([
          new Promise(resolve => setTimeout(() => resolve({ __sentinel: 'timeout' }), 8_000)),
          withEnv({ PATH: isolatedPath }, () =>
            doClaudeTuiStream({
              agent: 'claude',
              prompt: 'hello',
              workdir: tmpDir,
              timeout: 3,
              sessionId: null,
              model: null,
              thinkingEffort: 'medium',
              onText,
              extraEnv: { PATH: isolatedPath },
            }),
          ),
        ]);
      } catch (e) {
        thrown = e;
      }
      if (thrown) {
        expect(String(thrown?.message || thrown)).toMatch(/pty\.spawn|claude|node-pty|posix_spawnp|ENOENT/i);
      } else if (result && !result.__sentinel) {
        expect(result.ok).toBe(false);
        expect(result.incomplete).toBe(true);
      }
    } finally {
      try { fs.rmSync(isolatedPath, { recursive: true, force: true }); } catch {}
    }
  }, 15_000);
});

describe('Claude TUI driver — upfront session-id promotion', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let tmpDir: string;
  const onText = vi.fn();

  beforeEach(() => {
    onText.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-tui-promote-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  async function runWithBrokenSpawn(sessionId: string | null, onSessionId: (id: string) => void) {
    const isolatedPath = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-no-claude-'));
    const { doClaudeTuiStream } = await import('../src/agent/drivers/claude-tui.ts');
    try {
      await Promise.race([
        new Promise(resolve => setTimeout(() => resolve(null), 8_000)),
        withEnv({ PATH: isolatedPath }, () =>
          doClaudeTuiStream({
            agent: 'claude',
            prompt: 'hello',
            workdir: tmpDir,
            timeout: 3,
            sessionId,
            model: null,
            thinkingEffort: 'medium',
            onText,
            onSessionId,
            extraEnv: { PATH: isolatedPath },
          }),
        ),
      ]).catch(() => {  });
    } finally {
      try { fs.rmSync(isolatedPath, { recursive: true, force: true }); } catch {}
    }
  }

  it('fires onSessionId for a new (pending) session, but not when resuming a native session', async () => {
    const seenNew: string[] = [];
    await runWithBrokenSpawn(null, id => seenNew.push(id));
    expect(seenNew.length).toBeGreaterThan(0);
    expect(seenNew[0]).toMatch(UUID_RE);

    const seenResume: string[] = [];
    await runWithBrokenSpawn('f7e0b5a8-ff07-45a4-8282-1a1bb99340ac', id => seenResume.push(id));
    expect(seenResume).toEqual([]);
  }, 20_000);
});

describe('Claude TUI driver — terminal limit notices', () => {
  it('detects synthetic + screen-only limit notices but ignores ordinary rate-limit prose', async () => {
    const { detectClaudeTuiTerminalLimitNotice } = await import('../src/agent/drivers/claude-tui.ts');
    const notice = detectClaudeTuiTerminalLimitNotice({
      model: '<synthetic>',
      content: [{ type: 'text', text: "You've hit your session limit · resets 9:40pm (Asia/Shanghai)" }],
    });
    expect(notice).toContain("You've hit your session limit");
    expect(detectClaudeTuiTerminalLimitNotice(
      "You're now using usage credits · Your session limit resets 3pm(Asia/Shanghai)",
