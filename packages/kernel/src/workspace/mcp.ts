import type { McpServerSpec } from '../contracts/driver.js';
import { searchNpmPackages } from './npm-search.js';

// ---- McpRegistry: the unified MCP catalog + discovery ----
//
// The kernel ships a small curated catalog of well-known MCP servers and a search over the
// public MCP registry / npm, so a consuming app can offer "recommended" servers and a search
// box without hardcoding either. ENABLING a server (writing per-session config / injecting it
// into a spawn) stays on the existing Plugin.tools()/ToolProvider seam — this manager is the
// catalog + search half of "unified mcp management".

export interface McpCatalogEntry {
  id: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  transport:
    | { type: 'stdio'; command: string; args?: string[] }
    | { type: 'http'; url: string };
  /** Required credential env var names (so a UI can prompt for them). */
  envKeys?: string[];
  homepage?: string;
}

export interface McpSearchResult {
  name: string;
  description: string | null;
  source: 'registry' | 'npm';
  npmPackage?: string | null;
  homepage?: string | null;
}

