import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { saveUserConfig } from '../src/core/config/user-config.ts';
import { getGlobalExtensionsAsServers } from '../src/agent/mcp/extensions.ts';
import { buildCodexMcpAddArgs, buildGeminiMcpConfig } from '../src/agent/mcp/bridge.ts';
import { withTempHome } from './support/env.ts';

describe('getGlobalExtensionsAsServers — HTTP transport', () => {
  it('injects OAuth headers, skips disabled entries, and lets workspace .mcp.json override globals', async () => {
    await withTempHome(async () => {
      saveUserConfig({
        extensions: {
          mcp: {
            notion: {
              type: 'http',
              url: 'https://mcp.notion.com/mcp',
              enabled: true,
              catalogId: 'notion',
            },
          },
          mcpTokens: {
            notion: {
              accessToken: 'tok-abc',
              tokenType: 'Bearer',
            },
          },
        },
      });

      const servers = getGlobalExtensionsAsServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]).toMatchObject({
        name: 'notion',
        type: 'http',
        url: 'https://mcp.notion.com/mcp',
        headers: { Authorization: 'Bearer tok-abc' },
      });
    });

    await withTempHome(async () => {
      saveUserConfig({
        extensions: {
          mcp: {
            generic: {
              type: 'http',
              url: 'https://example.com/mcp',
              enabled: true,
            },
          },
        },
      });

      const [server] = getGlobalExtensionsAsServers();
      expect(server).toMatchObject({ name: 'generic', type: 'http', url: 'https://example.com/mcp' });
      expect(server.headers).toBeUndefined();
    });

    await withTempHome(async () => {
      saveUserConfig({
        extensions: {
          mcp: {
            'off-http': {
              type: 'http',
