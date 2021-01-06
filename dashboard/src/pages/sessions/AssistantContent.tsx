import { useState, useRef, useLayoutEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../../utils';
import { CollapsibleCard, CountBadge } from '../../components/ui';
import { PlanProgressCard, hasPlan } from '../../components/PlanProgressCard';
import { createMarkdownComponents, mdPlugins, LinkifyPaths } from './markdown';
import { lastNLines, latestOwnPlan, summarizeToolResult, summarizeToolUse } from './utils';
import { ImageLightbox } from './TurnView';
import { SubAgentCard } from './LivePreview';
import { FileChip } from './FileChip';
import type { RichMessage, MessageBlock } from '../../types';

export function AssistantMsg({ message, t, workdir }: {
  message: RichMessage; t: (k: string) => string; workdir?: string | null;
}) {
  const { activityBlocks, thinkingBlocks, planBlocks, subAgentBlocks, outputBlocks, noticeBlocks } = categorizeAssistantBlocks(message.blocks);
  const planToShow = latestOwnPlan(planBlocks);
  const hasContent = activityBlocks.length > 0 || subAgentBlocks.length > 0 || !!planToShow || thinkingBlocks.length > 0 || outputBlocks.length > 0 || noticeBlocks.length > 0;
  if (!hasContent) return null;
  return (
    <div className="space-y-3">
      {activityBlocks.length > 0 && <ActivitySection blocks={activityBlocks} t={t} workdir={workdir} />}
      {subAgentBlocks.map(block => block.subAgent ? (
        <SubAgentCard key={block.toolId || block.subAgent.id} sub={block.subAgent} t={t} />
      ) : null)}
      {planToShow && <PlanProgressCard plan={planToShow} t={t} className="max-w-[760px]" />}
      {thinkingBlocks.length > 0 && <ThinkingSection blocks={thinkingBlocks} t={t} />}
      {outputBlocks.length > 0 && <OutputBlock blocks={outputBlocks} t={t} workdir={workdir} />}
      {noticeBlocks.length > 0 && <SystemNoticeSection blocks={noticeBlocks} t={t} />}
    </div>
  );
}

export function hasRenderableAssistant(message: RichMessage): boolean {
  const { activityBlocks, thinkingBlocks, planBlocks, subAgentBlocks, outputBlocks, noticeBlocks } = categorizeAssistantBlocks(message.blocks);
  return outputBlocks.length > 0
    || activityBlocks.length > 0
    || subAgentBlocks.length > 0
    || thinkingBlocks.length > 0
    || planBlocks.some(b => hasPlan(b.plan))
    || noticeBlocks.length > 0;
}

export function categorizeAssistantBlocks(blocks: MessageBlock[]): {
  activityBlocks: MessageBlock[];
  thinkingBlocks: MessageBlock[];
  planBlocks: MessageBlock[];
  subAgentBlocks: MessageBlock[];
  outputBlocks: MessageBlock[];
  noticeBlocks: MessageBlock[];
} {
  const normalized = blocks.filter(block =>
    block.type === 'plan'
    || block.type === 'tool_use'
    || block.type === 'tool_result'
    || block.type === 'image'
    || block.type === 'file'
    || block.type === 'sub_agent'
    || !!block.content.trim(),
  );
  return {
    activityBlocks: normalized.filter(b => b.type === 'tool_use' || b.type === 'tool_result'),
    thinkingBlocks: normalized.filter(b => b.type === 'thinking'),
    planBlocks: normalized.filter(b => b.type === 'plan' && hasPlan(b.plan)),
    subAgentBlocks: normalized.filter(b => b.type === 'sub_agent'),
    outputBlocks: normalized.filter(b => b.type === 'text' || b.type === 'image' || b.type === 'file'),
    noticeBlocks: normalized.filter(b => b.type === 'system_notice'),
  };
}

