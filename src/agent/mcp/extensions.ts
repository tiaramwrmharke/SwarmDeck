import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadUserConfig, saveUserConfig } from '../../core/config/user-config.js';
import type { McpServerConfig } from '../../core/config/user-config.js';
import { terminateProcessTree } from '../../core/process-control.js';
import {
  getRecommendedMcpServers,
  type RecommendedMcpServer,
  type McpAuthSpec,
  type McpCategory,
  type RecommendedScope,
} from './registry.js';
import { hasValidMcpToken, injectOAuthHeaders } from './oauth.js';

export type ExtensionScope = 'global' | 'workspace' | 'builtin';

export interface McpExtensionEntry {
  name: string;
  config: McpServerConfig;
  scope: ExtensionScope;
  source?: string;
}

export interface McpHealthResult {
  ok: boolean;
  tools?: string[];
  error?: string;
  elapsedMs?: number;
}

export type McpCatalogState =
  | 'recommended'
  | 'needs_auth'
  | 'disabled'
  | 'ready'
  | 'unhealthy';

export interface McpCatalogItem {
  id: string;
  name: string;
  description: string;
  descriptionZh: string;
  category: McpCategory | 'custom';
  iconSlug?: string;
  iconUrl?: string;
  homepage?: string;
  transport: { type: 'stdio' | 'http'; summary: string };
  auth: McpAuthSpec;
  state: McpCatalogState;
  isRecommended: boolean;
  installed: boolean;
  scope?: ExtensionScope;
  config?: McpServerConfig;
  installedKey?: string;
  recommendedScope?: RecommendedScope;
  isBuiltin?: boolean;
}

interface RegisteredMcpServer {
  name: string;
  type?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export function loadGlobalMcpExtensions(): McpExtensionEntry[] {
  const config = loadUserConfig();
  const mcp = config.extensions?.mcp;
  if (!mcp || typeof mcp !== 'object') return [];
  return Object.entries(mcp).map(([name, cfg]) => ({
    name,
    config: cfg,
    scope: 'global' as const,
  }));
}

export function addGlobalMcpExtension(name: string, config: McpServerConfig): void {
  const userConfig = loadUserConfig();
  const extensions = userConfig.extensions ?? {};
  const mcp = { ...(extensions.mcp ?? {}) };
  mcp[name] = config;
  saveUserConfig({ ...userConfig, extensions: { ...extensions, mcp } });
}

export function removeGlobalMcpExtension(name: string): boolean {
  const userConfig = loadUserConfig();
  const mcp = { ...(userConfig.extensions?.mcp ?? {}) };
  if (!(name in mcp)) return false;
  delete mcp[name];
  saveUserConfig({
    ...userConfig,
    extensions: { ...userConfig.extensions, mcp },
  });
  return true;
}

