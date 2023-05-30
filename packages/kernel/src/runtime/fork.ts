import type { UniversalSnapshot } from '../protocol/index.js';

// Context replay for a SEED-mode fork — the fallback for drivers without native fork
// (capabilities.fork unset) or forks whose cut point could not be pinned to a native
// anchor. The branch starts a FRESH native session whose first prompt is prefixed with
// the copied transcript, role-tagged and tail-truncated. Native-mode forks never see
// this: their context comes from the agent's own store via resume+fork.

const FORK_SEED_BUDGET_CHARS = 60_000;

export function buildForkSeed(turns: UniversalSnapshot[], budget = FORK_SEED_BUDGET_CHARS): string | null {
  const messages: string[] = [];
  for (const t of turns) {
