import fs from 'node:fs';
import path from 'node:path';
import type { LoomPaths, LoomScope } from './paths.js';
import { searchNpmPackages } from './npm-search.js';

// ---- SkillsManager: the unified skills registry ("注册到全局目录然后给各 agent 做软链") ----
//
// Skills live ONCE under the top-level dir's `skills/` (canonical), and each agent's native
// skills dir (~/.claude/skills, ~/.agents/skills, or the per-workspace equivalents) is a
// symlink to it. So a skill registered in one place is visible to every agent, and the kernel
// owns the listing + discovery + search. Faithful, generalized port of swarmdeck's skills.ts.

export interface SkillInfo {
  name: string;
  label: string | null;
  description: string | null;
  scope: LoomScope;
  path: string;
  mcpRequires?: string[];
}

export interface SkillSearchResult {
  name: string;
  description: string | null;
  source: string;
  author?: string | null;
  homepage?: string | null;
  version?: string | null;
}

export interface SkillsManagerOptions {
  paths: LoomPaths;
  /** Agent skills dirs (relative to the scope's agentHome) to symlink to the canonical dir. */
  agentSkillDirs?: string[];
  log?: (msg: string) => void;
}

const DEFAULT_AGENT_SKILL_DIRS = ['.claude/skills', '.agents/skills'];

export interface SkillMeta {
  label: string | null;
  description: string | null;
  mcpRequires?: string[];
}

/**
 * Parse a SKILL.md's frontmatter (label/name + description + mcp_requires), falling back
 * to the first `# heading` for the label. Exported so an app scanning additional skill
 * stores (e.g. an agent's own ~/.claude/skills) reads them with the same rules.
 */
