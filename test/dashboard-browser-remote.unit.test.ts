import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBrowserStatusResponse } from '../src/dashboard/routes/config.ts';

const headlessNoChrome = {
  status: 'chrome_missing' as const,
  profileDir: '/home/piki/.swarmdeck/browser/chrome-profile',
  profileCreated: false,
  chromeInstalled: false,
  running: false,
  pid: null,
  detail: 'Chrome is not available on this machine.',
  chromeExecutable: null,
  launchCommand: [] as string[],
};

describe('dashboard browser status — remote CDP mode (issue #16)', () => {
  const prev = process.env.PIKILOOM_BROWSER_CDP_URL;
  beforeEach(() => { delete process.env.PIKILOOM_BROWSER_CDP_URL; });
