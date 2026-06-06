import { describe, expect, it } from 'vitest';
import { liveStreamFailureLabelKey } from '../dashboard/src/pages/sessions/LivePreview.tsx';
import { getSessionRunFailureDetail } from '../dashboard/src/utils.ts';

describe('dashboard session failure display', () => {
  it('shows errors correctly: done-stream error, persisted detail, and no duplication while live stream owns the turn', () => {
    expect(liveStreamFailureLabelKey({
      phase: 'done',
      text: 'Partial answer before the agent failed.',
