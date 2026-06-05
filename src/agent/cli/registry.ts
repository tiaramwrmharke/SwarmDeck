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
