import { request } from 'undici';
import { resolveCredential } from '../core/secrets/index.js';
import type { ProviderConfig, ProviderValidationStatus } from './types.js';

const VALIDATION_TIMEOUT_MS = 10_000;

export interface ProviderModelInfo {
  id: string;
  name?: string;
  created?: number;
  contextLength?: number;
  pricePromptUsd?: number;
  priceCompletionUsd?: number;
}

export interface ProviderValidationResult {
  status: ProviderValidationStatus;
  models: string[];
  modelInfos: ProviderModelInfo[];
}

interface ListModelsItem {
  id?: string;
  name?: string;
  display_name?: string;
  created?: number | string;
  context_length?: number;
  max_tokens?: number;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    input?: string | number;
    output?: string | number;
  };
}

interface ListModelsResponse {
  data?: ListModelsItem[];
  models?: ListModelsItem[];
}

function buildHeaders(provider: ProviderConfig, apiKey: string): Record<string, string> {
  const base: Record<string, string> = { 'Accept': 'application/json' };
  switch (provider.kind) {
    case 'anthropic':
      base['x-api-key'] = apiKey;
      base['anthropic-version'] = '2023-06-01';
      break;
    case 'google':
      break;
    case 'openai':
    case 'openai-compatible':
    default:
      base['Authorization'] = `Bearer ${apiKey}`;
      break;
  }
  if (provider.extraHeaders) Object.assign(base, provider.extraHeaders);
  return base;
}

function modelsUrl(provider: ProviderConfig, apiKey: string): string {
