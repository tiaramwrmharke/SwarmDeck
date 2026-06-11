import type {
  UniversalSnapshot, SnapshotPatch, SessionMeta,
  AgentInfo, ModelDescriptor, EffortOption, ToolDescriptor, SkillDescriptor,
} from '../protocol/index.js';
import type { McpServerSpec } from './driver.js';

// The single seam every entrypoint binds to. IM channels and the Web/tunnel terminal
// are ALL just `Surface`s over the same `LoomIO`. The kernel drives sessions and
// publishes snapshots; a terminal translates an external surface to/from this API.

export interface PromptInput {
  prompt: string;
  agent?: string;
  sessionKey?: string;
  workdir?: string;
  model?: string | null;
  effort?: string | null;
  attachments?: string[];
}

// Branch a session at a turn boundary into a NEW session; the source is never mutated.
export interface ForkSessionInput {
  fromSessionKey: string;
  // Last KEPT turn (kernel taskId from the parent's transcript); omit/null = keep everything
  // up to the parent's current tail. A cut aimed at a round that never landed (see
  // `turnLanded`) steps back to the last one that did — `ForkSessionResult` reports where.
  atTaskId?: string | null;
  // Explicit agent-native keep-boundary override (same terms as AgentTurnInput.fork.anchor)
  // for the REQUESTED cut. Ignored when the cut had to step back, since it names one turn —
  // pass `anchors` instead to enrich a whole transcript. When absent the hub resolves it from
  // the kept turn's recorded anchor, else from the driver's resolveNativeAnchor (tail cuts),
  // else falls back to a seed fork.
  anchor?: string | null;
  // Per-turn native anchors keyed by kernel taskId, for transcripts the kernel never recorded
  // anchors on (e.g. an app that parsed the agent's own transcript for a pre-existing session).
  // Consulted for whichever turn the cut RESOLVES to, so the step-back keeps its native fork.
  anchors?: Record<string, string | null>;
  title?: string | null;
}

// What a fork actually did — a fork resolves its own cut point and its own mode, so the caller
// is told rather than left to infer it from the session record (or from a branch that silently
// came out shaped differently than asked).
export interface ForkSessionResult {
  sessionKey: string;
  // The turn the branch was really cut at (null = nothing was kept: the whole transcript was
  // dropped, or the parent had no turns). Equals the requested `atTaskId` unless it stepped back.
  atTaskId: string | null;
  // The native keep-boundary pinned for the branch; null = none, so the first dispatch seeds.
  anchor: string | null;
  // How that first dispatch will materialize the branch: resume the parent's native session with
  // a fork flag, or start fresh and replay the copied transcript as a context seed.
  mode: 'native' | 'seed';
  // Turns skipped by the step-back, in transcript order (the requested cut last) — rounds the
  // agent refused, which are therefore absent from the branch. Empty on a normal fork. The
  // caller owns what happens next: a UI typically hands the first prompt back to its composer.
  droppedTaskIds: string[];
