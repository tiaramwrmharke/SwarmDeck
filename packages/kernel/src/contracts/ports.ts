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
  runDetail?: string | null;
  // Liveness ownership for a 'running' turn: the OS pid of the process driving it, plus when it
  // started. A store shared by multiple processes (e.g. a dev + prod app on the same home dir)
  // uses this to tell a crashed orphan (owner pid dead) apart from a turn live in another
  // process (owner pid alive) during boot reconciliation — see SessionStore.reconcileRunning.
  runPid?: number | null;
  runStartedAt?: number | null;
  // Fork lineage: set once at Hub.forkSession and never cleared — consumers use it to label
  // the branch. `taskId` is the last KEPT parent turn (null = forked at the parent's tail).
  forkedFrom?: { sessionKey: string; taskId?: string | null } | null;
  // Fork intent, pending until the first dispatch materializes the branch (then cleared).
  // mode 'native': resume the parent's native id with AgentTurnInput.fork (fork-capable
  // drivers). mode 'seed': start a fresh native session and replay the copied transcript
  // as a context seed (any driver). `anchor` is pinned at fork time so the branch is
