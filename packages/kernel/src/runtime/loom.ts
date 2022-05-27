import type { AgentDriver, TuiSpec } from '../contracts/driver.js';
import type { SessionStore, ModelResolver, ToolProvider, SystemPromptBuilder, Catalog, InteractionHandler } from '../contracts/ports.js';
import type { LoomIO, Surface, Plugin } from '../contracts/surface.js';
import {
  FsSessionStore, NullModelResolver, NoopToolProvider, PassthroughSystemPromptBuilder, NoopCatalog,
  DeferToTerminalInteractionHandler, defaultBaseDir, isProcessAlive,
} from '../ports/defaults.js';
import { Hub } from './hub.js';
import { PtyBridge, type PtyOpenOpts, type PtyExit } from './pty.js';
import { attachTui } from './tui.js';
import { resolveLoomPaths, type LoomPaths } from '../workspace/paths.js';
import { SessionsManager } from '../workspace/sessions.js';
import { SkillsManager } from '../workspace/skills.js';
import { McpRegistry } from '../workspace/mcp.js';

export interface TuiLaunchOptions {
  agent?: string;
  workdir?: string;
  model?: string | null;
  sessionId?: string | null;
}

export interface LoomConfig {
  // The top-level directory name (no leading dot), default 'swarmdeck' → `.swarmdeck`. Governs
  // the skills registry + per-workspace/global roots (loom.paths/skills/mcp). Falls back to
  // appNamespace for back-compat.
  stateDirName?: string;
  appNamespace?: string;          // names ~/.<ns>/sessions for the default store (defaults to stateDirName)
  workdir?: string;               // default cwd for runs
  defaultAgent?: string;
  // Agent skill dirs (relative to the scope's home) that symlink to the canonical skills dir;
  // default ['.claude/skills', '.agents/skills'].
  agentSkillDirs?: string[];
  drivers?: AgentDriver[];        // the "下层": Claude/Codex/... (explicit; escape hatch = registerDriver)
  surfaces?: Surface[];         // the "上层": IM channels + Web/tunnel, all over LoomIO
  plugins?: Plugin[];
  // side ports — all optional, sane defaults:
  sessionStore?: SessionStore;
  modelResolver?: ModelResolver;
  toolProvider?: ToolProvider;
  systemPromptBuilder?: SystemPromptBuilder;
  catalog?: Catalog;              // discovery of models/effort/tools/skills (app SSOT); default empty
  interactionHandler?: InteractionHandler;  // HITL resolver; default defers to a terminal's interact()
  serialPerSession?: boolean;     // default true: queue concurrent prompts to one session (no clobber)
  systemPromptBase?: string;
  log?: (msg: string) => void;
}

export interface Loom {
  readonly io: LoomIO;
