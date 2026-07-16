import type {
  UniversalToolCall, UniversalPlan, UniversalUsage,
  UniversalInteraction, UniversalArtifact, UniversalSubAgent,
} from '../protocol/index.js';

// The agent axis (the "下层" — Claude / Codex / Gemini / ACP). A driver knows how to
// spawn ONE turn of ONE agent CLI and emit normalized events. It knows nothing about
// IM, web, queues, or persistence — those live above it.

export interface AgentTurnInput {
  prompt: string;
  attachments?: string[];
  sessionId?: string | null;      // resume target (null/undefined = fresh)
  // Fork-on-dispatch: with `sessionId` set to the PARENT's native id, branch a NEW native
  // session off it instead of appending — the parent transcript is never touched. `anchor`
  // is the agent-native INCLUSIVE keep-boundary (claude: transcript record uuid of the last
  // kept message; codex: the last kept turn id); null/absent forks at the parent's tail.
  // Only drivers declaring capabilities.fork honor this; the hub never sets it for others.
  fork?: { anchor?: string | null } | null;
  // In-place rewind (tip regeneration): resume `sessionId` (this session's OWN native id) but
  // rebranch at `anchor` — the last KEPT turn's native boundary — instead of appending, so the
  // dropped tip leaves the active context. Same native session id (NOT a fork/new session).
  // Mutually exclusive with `fork`. Only drivers declaring capabilities.rewind honor it.
  rewind?: { anchor?: string | null } | null;
  workdir: string;
  model?: string | null;
  effort?: string | null;
  systemPrompt?: string;          // composed first-turn system/developer prompt
  env?: Record<string, string>;   // injected by ModelResolver (BYOK base url / key / etc.)
  extraMcpServers?: McpServerSpec[];
  mcpConfigPath?: string | null;  // path to an agent-native MCP config file (Claude --mcp-config)
  permissionMode?: string | null; // agent-native permission mode (Claude --permission-mode); must be carried so the kernel path preserves bypass/accept-edits
  extraArgs?: string[];           // verbatim passthrough flags the app already resolved
  configOverrides?: string[];     // codex `-c key=value` overrides (BYOK provider routing); carried so the kernel path keeps BYOK
  fullAccess?: boolean;           // codex full-access (approvalPolicy=never, sandbox=danger-full-access)
  steerable?: boolean;            // enable mid-turn steer (Claude stream-json input mode)
}

export interface McpServerSpec {
  name: string;
  type?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export type DriverEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool'; call: UniversalToolCall }
  | { type: 'plan'; plan: UniversalPlan }
  | { type: 'subagent'; subagent: UniversalSubAgent }
  | { type: 'usage'; usage: Partial<UniversalUsage> }
  | { type: 'artifact'; artifact: UniversalArtifact }
  | { type: 'activity'; line: string }
  | { type: 'compaction'; trigger: 'auto' | 'manual'; atTokens?: number | null };
