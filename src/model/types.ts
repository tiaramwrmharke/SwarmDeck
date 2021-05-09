import type { CredentialRef } from '../core/secrets/index.js';

export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'openai-compatible'
  | 'google';

export interface ProviderValidationStatus {
  state: 'unknown' | 'ready' | 'invalid' | 'error';
  detail: string;
  checkedAt: string;
  modelCount?: number;
}

export interface ProviderConfig {
  id: string;
