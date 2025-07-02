import crypto from 'node:crypto';
import {
  loadUserConfig,
  saveUserConfig,
  type McpOAuthTokenRecord,
} from '../../core/config/user-config.js';
import type { McpAuthSpec } from './registry.js';

export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface OAuthProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
}

interface PendingOAuthFlow {
  state: string;
  codeVerifier: string;
  serverId: string;
  resource: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  authorizationEndpoint: string;
  registrationEndpoint?: string;
  redirectUri: string;
  createdAt: number;
}

export interface StartOAuthResult {
  authUrl: string;
  state: string;
}

export interface CompleteOAuthResult {
  ok: true;
  serverId: string;
}

export function getMcpToken(serverId: string): McpOAuthTokenRecord | undefined {
  const cfg = loadUserConfig();
  return cfg.extensions?.mcpTokens?.[serverId];
}

export function saveMcpToken(serverId: string, token: McpOAuthTokenRecord): void {
  const cfg = loadUserConfig();
  const extensions = cfg.extensions ?? {};
  const mcpTokens = { ...(extensions.mcpTokens ?? {}) };
  mcpTokens[serverId] = token;
  saveUserConfig({ ...cfg, extensions: { ...extensions, mcpTokens } });
}

export function deleteMcpToken(serverId: string): boolean {
  const cfg = loadUserConfig();
  const tokens = { ...(cfg.extensions?.mcpTokens ?? {}) };
  if (!(serverId in tokens)) return false;
  delete tokens[serverId];
  saveUserConfig({ ...cfg, extensions: { ...cfg.extensions, mcpTokens: tokens } });
  return true;
}

export function hasValidMcpToken(serverId: string): boolean {
  const token = getMcpToken(serverId);
  if (!token?.accessToken) return false;
  if (token.expiresAt && token.expiresAt < Date.now() + 30_000) return false;
  return true;
}

function randomUrlSafe(bytes: number): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

