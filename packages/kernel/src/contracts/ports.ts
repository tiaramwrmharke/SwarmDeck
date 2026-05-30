import type {
  UniversalInteraction, UniversalSnapshot,
  ModelDescriptor, EffortOption, ToolDescriptor, SkillDescriptor,
} from '../protocol/index.js';
import type { McpServerSpec, DriverResult } from './driver.js';

// Side ports: everything environmental that the kernel reaches through an interface,
// so a consuming app can swap storage / credentials / tools / prompts without forking.
// Every port ships a default impl (see ../ports/defaults.ts) so `createLoom()` runs
// with zero wiring.

export interface CoreSessionRecord {
  agent: string;
  sessionId: string;            // stable kernel id (== sessionKey suffix)
  nativeSessionId?: string | null; // agent-native id for resume (e.g. claude's own id)
  workspacePath: string;
  workdir?: string | null;      // the cwd the turn ran in — scopes managed sessions per workspace
  createdAt: string;
  updatedAt: string;
  title?: string | null;
  preview?: string | null;      // head of the latest assistant text (for list rendering)
  model?: string | null;
  effort?: string | null;
  runState?: 'running' | 'completed' | 'incomplete';
