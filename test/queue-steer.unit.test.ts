import { describe, expect, it } from 'vitest';
import { queuedIdsToDeferForSteer } from '../src/bot/queue-steer';

// Mirrors queueSessionTask's runner: a task flagged deferForSteer skips its turn
// once (flag cleared) and re-appends to the tail. Simulating it proves the
// emergent run order from a given defer-set.
function simulateRunOrder(queuedIds: string[], deferIds: string[]): string[] {
  const chain = [...queuedIds];
  const deferred = new Set(deferIds);
  const runOrder: string[] = [];
  let guard = 0;
  while (chain.length && guard++ < 1000) {
    const head = chain.shift()!;
    if (deferred.has(head)) {
      deferred.delete(head);
      chain.push(head);
    } else {
      runOrder.push(head);
    }
  }
  return runOrder;
