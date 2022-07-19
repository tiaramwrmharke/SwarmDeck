export type SnapshotSource = 'ws' | 'seed';

export interface SnapshotGateInput {
  updatedAt: number | null | undefined;
  isNull: boolean;
  source: SnapshotSource;
  lastAppliedUpdatedAt: number;
  localStreamPending: boolean;
  holdsActiveState: boolean;
  // True when the local hold (pending send / active stream view) has gone unconfirmed past its
  // TTL — no non-null snapshot has arrived for that long. Without this escape hatch a worker
  // replaced under the tab wedges the panel forever: the new worker's stream-state is null,
  // the null is rejected because of the very hold it can no longer confirm, and only a manual
  // page refresh recovers.
  holdExpired?: boolean;
}

export type SnapshotGateDecision = 'apply' | 'reject-stale' | 'reject-null';

export function snapshotGate(input: SnapshotGateInput): SnapshotGateDecision {
  if (input.isNull) {
    if ((input.localStreamPending || input.holdsActiveState) && !input.holdExpired) return 'reject-null';
    return 'apply';
  }
