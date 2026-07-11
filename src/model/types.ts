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
  kind: ProviderKind;
  name: string;
  baseURL: string;
  credential: CredentialRef;
  extraHeaders?: Record<string, string>;
  validation?: ProviderValidationStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProfileConfig {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  maxOutputTokens?: number | null;
  extras?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
