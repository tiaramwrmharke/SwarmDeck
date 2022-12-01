import { useState, useRef, useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { CollapsibleCard, CountBadge } from '../../components/ui';
import { PlanProgressCard, hasPlan } from '../../components/PlanProgressCard';
import { createMarkdownComponents, mdPlugins, LinkifyPaths } from './markdown';
import { lastNLines, classifyRunEnd, formatTokens, formatTokensShort, contextDotClass, formatElapsedCompact } from './utils';
import { cn, shortenModel } from '../../utils';
import { FileChip } from './FileChip';
import type { StreamPlan, StreamSubAgent, StreamPreviewMeta, StreamToolCall, SnapshotArtifact } from '../../types';

export interface LiveStreamView {
  phase: 'streaming' | 'done';
  text: string;
  thinking: string;
  activity?: string;
  plan?: StreamPlan | null;
  subAgents?: StreamSubAgent[] | null;
  error?: string | null;
  generatingImages?: number;
  previewMeta?: StreamPreviewMeta | null;
  artifacts?: SnapshotArtifact[] | null;
  startedAt?: number | null;
}

export function liveStreamHasBody(stream: LiveStreamView): boolean {
  return !!stream.text
    || !!stream.thinking
    || !!(stream.activity && stream.activity.split('\n').filter(Boolean).length)
    || !!(stream.previewMeta?.toolCalls?.length)
    || hasPlan(stream.plan)
    || !!(stream.subAgents && stream.subAgents.length)
    || !!(stream.artifacts && stream.artifacts.length);
}

export function liveStreamShouldRender(stream: LiveStreamView): boolean {
  if (liveStreamHasBody(stream)) return true;
  if (stream.phase === 'streaming') return true;
  return stream.phase === 'done' && !!stream.error;
}

export function liveStreamFailureLabelKey(stream: LiveStreamView): string | null {
  if (stream.phase !== 'done' || !stream.error) return null;
  return liveStreamHasBody(stream) ? 'hub.streamErrored' : 'hub.streamFailed';
}

export function RunEndNotice({ detail, t, className }: {
  detail: string;
  t: (k: string) => string;
  className?: string;
}) {
  const kind = classifyRunEnd(detail);
  if (kind === 'interrupted') {
    return (
      <div className={cn('flex items-center gap-1.5 text-[11px] text-fg-5/55', className)}>
        <span className="inline-block h-2 w-2 rounded-[2px] bg-fg-5/45 shrink-0" />
        <span>{t('hub.turnStopped')}</span>
      </div>
    );
  }
  const tone = kind === 'error'
    ? { dot: 'bg-rose-400/55', text: 'text-rose-300/65' }
    : { dot: 'bg-fg-5/40', text: 'text-fg-5/55' };
  return (
    <div className={cn('flex items-start gap-1.5 text-[11px] leading-[1.6]', tone.text, className)}>
      <span className={cn('mt-[5px] h-1 w-1 rounded-full shrink-0', tone.dot)} />
      <span className="min-w-0 break-words">{detail}</span>
    </div>
  );
}

const STREAM_MARKDOWN_THROTTLE_MS = 64;

function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastAppliedAt = useRef(0);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (intervalMs <= 0) return;
    const elapsed = Date.now() - lastAppliedAt.current;
    const apply = () => { lastAppliedAt.current = Date.now(); setThrottled(value); };
    if (elapsed >= intervalMs) {
      apply();
    } else {
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(apply, intervalMs - elapsed);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, intervalMs]);
  return intervalMs <= 0 ? value : throttled;
}

export function LivePreview({
  stream,
  t,
  workdir,
}: {
