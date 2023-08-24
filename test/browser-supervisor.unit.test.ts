import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prepareMock = vi.fn();
const forceCloseMock = vi.fn();

vi.mock('../src/browser-profile.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/browser-profile.ts')>();
  return {
    ...actual,
    prepareManagedBrowserForAutomation: (...args: unknown[]) => prepareMock(...args),
    forceCloseManagedBrowser: (...args: unknown[]) => forceCloseMock(...args),
  };
});

const supervisor = await import('../src/browser-supervisor.ts');

describe('browser-supervisor', () => {
  beforeEach(() => {
    supervisor._resetManagedBrowserSupervisor();
    prepareMock.mockReset();
    forceCloseMock.mockReset();
    forceCloseMock.mockResolvedValue([]);
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('coalesces concurrent ensure() calls, reuses cache, re-prepares after invalidate, and probe() works', async () => {
    const makeHealthyFetch = () => vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/json/version')) return new Response(JSON.stringify({ webSocketDebuggerUrl: 'ws://x' }), { status: 200 });
      if (url.endsWith('/json')) return new Response(JSON.stringify([{ type: 'page', url: 'about:blank' }]), { status: 200 });
      return new Response('', { status: 404 });
    });

    prepareMock.mockResolvedValue({ profileDir: '/tmp/profile', closedPids: [], cdpEndpoint: 'http://127.0.0.1:39222', connectionMode: 'launch' });
    vi.stubGlobal('fetch', makeHealthyFetch());
    const [a, b, c] = await Promise.all([
      supervisor.ensureManagedBrowser(),
      supervisor.ensureManagedBrowser(),
      supervisor.ensureManagedBrowser(),
    ]);
    expect(prepareMock).toHaveBeenCalledTimes(1);
    expect(a.cdpEndpoint).toBe('http://127.0.0.1:39222');
    expect(b.cdpEndpoint).toBe('http://127.0.0.1:39222');
    expect(c.cdpEndpoint).toBe('http://127.0.0.1:39222');

    await supervisor.ensureManagedBrowser();
    await supervisor.ensureManagedBrowser();
    expect(prepareMock).toHaveBeenCalledTimes(1);

    supervisor.invalidateManagedBrowser();
