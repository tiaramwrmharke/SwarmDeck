import { resolveCredential } from '../core/secrets/index.js';
import { writeScopedLog } from '../core/logging.js';
import { getActiveProfile, getProfile, getProvider } from './store.js';
import { peekProviderModelInfo, prefetchProviderModels } from './provider-models.js';
import { ensureResponsesBridge, upstreamToken } from './responses-bridge.js';
import { ensureAnthropicBridge } from './anthropic-bridge.js';
import type { ProviderConfig, ModelProfileConfig, ProviderKind } from './types.js';

export interface InjectedSpawnConfig {
  env: Record<string, string>;
  argvAppend: string[];
  codexConfigOverrides?: string[];
  modelOverride?: string;
  contextWindow?: number;
  providerName?: string;
  configFiles?: Record<string, string>;
  homeOverride?: string;
  detail: string;
}

const EMPTY: InjectedSpawnConfig = { env: {}, argvAppend: [], detail: '' };

function providerHost(provider: ProviderConfig): string {
  try { return new URL(provider.baseURL).host.toLowerCase(); } catch { return ''; }
}

function providerSlug(provider: ProviderConfig): string {
  if (provider.kind === 'anthropic') return 'anthropic';
  if (provider.kind === 'openai') return 'openai';
  if (provider.kind === 'google') return 'google';
  const host = providerHost(provider);
  if (host.includes('deepseek')) return 'deepseek';
  if (host.includes('moonshot') || host.includes('kimi')) return 'kimi';
  if (host.includes('minimax')) return 'minimax';
  if (host.includes('zhipuai') || host.includes('z.ai') || host.includes('bigmodel')) return 'zai';
  if (host.includes('x.ai')) return 'xai';
  if (host.includes('stepfun')) return 'stepfun';
  if (host.includes('dashscope') || host.includes('qwen')) return 'qwen';
  if (host.includes('volces') || host.includes('volcengine') || host.includes('doubao')) return 'doubao';
  if (host.includes('openrouter')) return 'openrouter';
  const label = host.replace(/:\d+$/, '').replace(/^(www|api)\./, '').split('.')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return label || 'byok';
}

function providerCredentialEnv(provider: ProviderConfig, apiKey: string): Record<string, string> {
  if (provider.kind === 'anthropic') return { ANTHROPIC_API_KEY: apiKey };
  if (provider.kind === 'openai') return { OPENAI_API_KEY: apiKey };
  if (provider.kind === 'google') return { GOOGLE_API_KEY: apiKey, GEMINI_API_KEY: apiKey };
  const host = providerHost(provider);
  if (host.includes('openrouter')) return { OPENROUTER_API_KEY: apiKey };
  if (host.includes('deepseek')) return { DEEPSEEK_API_KEY: apiKey };
  if (host.includes('moonshot') || host.includes('kimi')) return { KIMI_API_KEY: apiKey, MOONSHOT_API_KEY: apiKey };
  if (host.includes('minimax')) return { MINIMAX_API_KEY: apiKey };
  if (host.includes('zhipuai') || host.includes('z.ai') || host.includes('bigmodel')) return { ZAI_API_KEY: apiKey, ZHIPU_API_KEY: apiKey };
  if (host.includes('x.ai')) return { XAI_API_KEY: apiKey };
  if (host.includes('stepfun')) return { STEPFUN_API_KEY: apiKey };
  if (host.includes('dashscope') || host.includes('qwen')) return { DASHSCOPE_API_KEY: apiKey, QWEN_API_KEY: apiKey };
  if (host.includes('volces') || host.includes('volcengine') || host.includes('doubao')) return { ARK_API_KEY: apiKey, DOUBAO_API_KEY: apiKey };
  return { OPENROUTER_API_KEY: apiKey };
}

function codexEnvKey(provider: ProviderConfig): string {
  const keys = Object.keys(providerCredentialEnv(provider, ''));
  return keys[0] || 'OPENROUTER_API_KEY';
}

function tomlEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const ANTHROPIC_ENDPOINT_BY_SLUG: Record<string, (origin: string) => string> = {
  deepseek: origin => `${origin}/anthropic`,
  kimi: origin => `${origin}/anthropic`,
  zai: origin => `${origin}/api/anthropic`,
};

function claudeAnthropicBaseURL(provider: ProviderConfig): string {
  const raw = provider.baseURL.replace(/\/+$/, '');
  if (provider.kind === 'anthropic') return raw.replace(/\/v1$/, '');
  const mapper = ANTHROPIC_ENDPOINT_BY_SLUG[providerSlug(provider)];
  if (mapper) {
    let origin: string;
    try { origin = new URL(raw).origin; } catch { return raw.replace(/\/v1$/, ''); }
    return mapper(origin);
  }
  return raw.replace(/\/v1$/, '');
}

function isFirstPartyAnthropic(baseURL: string): boolean {
  let host: string;
  try { host = new URL(baseURL).hostname.toLowerCase(); } catch { return false; }
  return host === 'anthropic.com' || host.endsWith('.anthropic.com');
}

function claudeUsesNativeAnthropic(provider: ProviderConfig): boolean {
  if (provider.kind === 'anthropic') return true;
  const slug = providerSlug(provider);
  if (slug in ANTHROPIC_ENDPOINT_BY_SLUG) return true;
  if (slug === 'openrouter') return true;
  return false;
}

