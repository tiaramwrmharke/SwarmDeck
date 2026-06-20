import type { MessageBlock, RichMessage, SessionMessagesResult, StreamPlan } from '../../types';

export interface Turn {
  user: RichMessage | null;
  assistant: RichMessage | null;
}

export interface TurnHistoryWindow {
  turns: Turn[];
  startTurn: number;
  endTurn: number;
  totalTurns: number;
  hasOlder: boolean;
}

export function normalizeUserText(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

export function sameUserText(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeUserText(a) === normalizeUserText(b);
}

export function promptEndsWithUserPrompt(
  fullPrompt: string | null | undefined,
  userPrompt: string | null | undefined,
): boolean {
  const full = normalizeUserText(fullPrompt);
  const user = normalizeUserText(userPrompt);
  return !!full && !!user && full !== user && full.endsWith(user);
}

export function displayPromptForPending(
  pendingPrompt: string | null | undefined,
  liveQuestion: string | null | undefined,
): string | null {
  if (liveQuestion && (!pendingPrompt || promptEndsWithUserPrompt(liveQuestion, pendingPrompt))) {
    return liveQuestion;
  }
  return pendingPrompt || liveQuestion || null;
}

export function shouldCarryLatestPlanIntoLiveStream(
  pendingPrompt: string | null | undefined,
  liveQuestion: string | null | undefined,
): boolean {
  return !displayPromptForPending(pendingPrompt, liveQuestion);
}

// The plan card an assistant turn renders = its OWN latest task-list snapshot only (TodoWrite /
// TaskCreate / TaskUpdate — latest wins within the turn), or none. A turn NEVER inherits a plan
// from another turn: cross-turn carry-forward is confined to the live stream
// (`shouldCarryLatestPlanIntoLiveStream`), so a settled/reconciled reply can no longer surface an
// earlier — often already completed — turn's plan under a new, unrelated message.
export function latestOwnPlan(planBlocks: MessageBlock[]): StreamPlan | null {
  for (let i = planBlocks.length - 1; i >= 0; i--) {
    const plan = planBlocks[i].plan;
    if (plan?.steps?.length) return plan;
  }
  return null;
}

// While a turn streams (before its native transcript is parseable) the history turn can
// carry a managed-fallback preview of the prompt truncated by shortValue ("<prefix>...").
// That truncated text never equals the full live prompt, so a plain sameUserText dedup
// fails and the same turn renders twice (truncated history bubble + full live-question
// bubble). Treat a truncated prefix as the same turn. Gated on a trailing ellipsis + a
// substantial prefix so unrelated earlier turns never false-match.
export function streamPromptMatchesTurnText(
  turnText: string | null | undefined,
  streamPrompt: string | null | undefined,
): boolean {
  if (sameUserText(turnText, streamPrompt)) return true;
  const turn = normalizeUserText(turnText);
  const prompt = normalizeUserText(streamPrompt);
