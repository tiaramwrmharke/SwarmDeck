import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  getBotRefMock,
  runtimeMock,
} = vi.hoisted(() => {
  const getBotRefMock = vi.fn();
  return {
    getBotRefMock,
    runtimeMock: {
      getBotRef: getBotRefMock,
    },
  };
});

vi.mock('../src/dashboard/runtime.ts', () => ({
  runtime: runtimeMock,
}));

describe('session-control', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('queues tasks and surfaces stream state, cancel, and steer through public bot methods', async () => {
    {
      const submitSessionTask = vi.fn(() => ({ ok: true, queued: true, taskId: 'task-1', sessionKey: 'codex:sess-1' }));
      getBotRefMock.mockReturnValue({ submitSessionTask });

      const { queueDashboardSessionTask } = await import('../src/dashboard/session-control.ts');
      const result = await queueDashboardSessionTask({
        workdir: '/tmp/swarmdeck',
        agent: 'codex',
        sessionId: 'sess-1',
        prompt: 'check',
        attachments: ['/tmp/a.png'],
      });

      expect(submitSessionTask).toHaveBeenCalledWith({
        workdir: '/tmp/swarmdeck',
        agent: 'codex',
        sessionId: 'sess-1',
        prompt: 'check',
