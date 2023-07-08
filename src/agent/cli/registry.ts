import type { CredentialField } from '../mcp/registry.js';

export type CliCategory =
  | 'dev'
  | 'cloud'
  | 'data'
  | 'commerce'
  | 'social'
  | 'content';

export type CliAuthType = 'oauth-web' | 'token' | 'none';

export interface CliInstallCommand {
  cmd: string;
  label?: string;
}

export interface CliInstallSpec {
  darwin?: CliInstallCommand[];
  linux?: CliInstallCommand[];
  win?: CliInstallCommand[];
  docs?: string;
}

export interface CliAuthSpec {
  type: CliAuthType;
  statusArgv?: string[];
  statusReadyPattern?: string;
  loginArgv?: string[];
  logoutArgv?: string[];
  manualLoginCommands?: { label?: string; cmd: string }[];
  tokenFields?: CredentialField[];
  applyTokenArgv?: string[];
  envKey?: string;
  loginHint?: string;
  loginHintZh?: string;
}
