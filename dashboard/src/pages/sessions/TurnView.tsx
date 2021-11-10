import { useMemo, useState, memo, type ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { cn, getAgentMeta } from '../../utils';
import { BrandIcon } from '../../components/BrandIcon';
import { createMarkdownComponents, mdPlugins } from './markdown';
import { isContinuationSummary, formatTokens, formatTokensShort, contextDotClass } from './utils';
import { AssistantMsg, hasRenderableAssistant } from './AssistantContent';
import type { MessageBlock, StreamPreviewMeta } from '../../types';
import type { Turn } from './utils';

export const TurnView = memo(function TurnView({ turn, turnIndex, agent, meta, model, effort, providerName, t, workdir, onResend, onEdit, onFork, hideHeaderUsage, isTail }: {
  turn: Turn; turnIndex?: number; agent: string; meta: ReturnType<typeof getAgentMeta>; model?: string | null; effort?: string | null; t: (k: string) => string; workdir?: string | null;
  providerName?: string | null;
  onResend?: (text: string) => void;
  onEdit?: (text: string) => void;
  onFork?: (atTurn: number) => void;
  // Set while this turn is still running (trailing status row shows usage instead), so the
  // header stays a clean identity line exactly like a live LivePreview turn.
  hideHeaderUsage?: boolean;
  // The most-recent turn: opt out of content-visibility skipping (its content streams/grows and
  // must never be collapsed to the intrinsic-size placeholder mid-render).
  isTail?: boolean;
}) {
  const isSystemMsg = turn.user && isContinuationSummary(turn.user.text);
  const handleFork = onFork && typeof turnIndex === 'number' ? () => onFork(turnIndex) : undefined;
  const markdownComponents = useMemo(() => createMarkdownComponents({ workdir }), [workdir]);
  const showAssistant = !!turn.assistant && hasRenderableAssistant(turn.assistant);

  return (
    <div className={cn('session-turn', isTail && 'session-turn--live')}>
      {turn.user && !isSystemMsg && (
        <UserBubble text={turn.user.text} blocks={turn.user.blocks} t={t} onResend={onResend} onEdit={onEdit} onFork={handleFork} />
      )}
      {isSystemMsg && turn.user && !turn.assistant && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-edge/20 text-[12.5px] leading-[1.7] text-fg-4">
          <ReactMarkdown remarkPlugins={mdPlugins} components={markdownComponents}>
            {turn.user.text}
          </ReactMarkdown>
        </div>
      )}
      {showAssistant && (
        <>
          <TurnDivider agent={agent} meta={meta} model={model} effort={effort} providerName={providerName} previewMeta={turn.assistant!.usage ?? null} hideContextUsage={hideHeaderUsage} />
          <div className="mb-6">
            <AssistantMsg message={turn.assistant!} t={t} workdir={workdir} />
          </div>
        </>
      )}
    </div>
  );
});

export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={src}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

const LONG_USER_TEXT_CHAR_THRESHOLD = 1500;
const LONG_USER_TEXT_LINE_THRESHOLD = 16;
const COLLAPSED_PREVIEW_LINES = 8;

