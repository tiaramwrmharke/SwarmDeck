import path from 'node:path';

export const MCP_TIMEOUTS = {
  sendFile: 60_000,
  requestBody: 10_000,
  serverRequest: 90_000,
  serverHeaders: 10_000,
  codexMcpAdd: 10_000,
  codexMcpRemove: 5_000,
};

export const MCP_ARTIFACT_MAX_BYTES = 20 * 1024 * 1024;

export const DASHBOARD_TIMEOUTS = {
  agentStatusModels: 4_000,
  agentStatusUsage: 1_500,
  channelStatusValidation: 3_000,
  channelStatusCacheTtl: 20_000,
  agentStatusCacheTtl: 30_000,
  agentInstall: 10 * 60_000,
  runCommand: 30_000,
};

export const STATE_DIR_NAME = '.swarmdeck';
export const ENV_PREFIX = 'PIKILOOM_';
export const LEGACY_STATE_DIR_NAMES = ['.pikiclaw'] as const;
export const LEGACY_ENV_PREFIXES = ['PIKICLAW_'] as const;

export const MANAGED_BROWSER_PROFILE_SUBPATH = path.join(STATE_DIR_NAME, 'browser', 'chrome-profile');

export const PLAYWRIGHT_MCP_PACKAGE_NAME = '@playwright/mcp';
export const PLAYWRIGHT_MCP_PACKAGE_VERSION = '0.0.75';
export const PLAYWRIGHT_MCP_PACKAGE_SPEC = `${PLAYWRIGHT_MCP_PACKAGE_NAME}@${PLAYWRIGHT_MCP_PACKAGE_VERSION}`;
export const PLAYWRIGHT_MCP_BROWSER_ARGS = ['--browser', 'chrome', '--viewport-size', '1920x1080'] as const;
// Chrome 150+ sets navigator.webdriver=true whenever remote debugging is on, which trips
// Google's "This browser or app may not be secure" sign-in block; --test-type suppresses
// the "unsupported command-line flag" infobar that the first flag would otherwise trigger.
export const MANAGED_BROWSER_STEALTH_ARGS = ['--disable-blink-features=AutomationControlled', '--test-type'] as const;

