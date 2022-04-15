import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo, useMemo } from 'react';
import { useStore } from '../../store';
import { createT } from '../../i18n';
import { api } from '../../api';
import { loadSessionMessages, peekSessionMessages } from '../../session-preload';
import { useDashboardEvent, useDashboardReconnect, type DashboardEvent } from '../../ws';
import { cn, foldUltraEffort, getAgentMeta, getSessionRunFailureDetail, shortenModel, sessionDisplayState } from '../../utils';
import { Spinner, Modal, ModalHeader, Button } from '../../components/ui';
import { hasPlan } from '../../components/PlanProgressCard';
import type { InteractionSnapshot, MessageBlock, QueuedTaskPreview, SessionInfo, StreamPlan, StreamPreviewMeta, StreamSubAgent, SnapshotArtifact } from '../../types';
import { TurnView, UserBubble, TurnDivider } from './TurnView';
import { LivePreview, ThinkingDots, LiveStatusRow, liveStreamShouldRender, liveStreamHasBody, RunEndNotice, type LiveStreamView } from './LivePreview';
import { hasRenderableAssistant } from './AssistantContent';
import { InputComposer } from './InputComposer';
import { InteractionPromptModal } from './InteractionPromptModal';
import { sendWillQueue, optimisticSendWasQueued, doneAppliesToLivePreview, shouldShowTrailingLoader } from './queue-logic';
import {
  snapshotGate,
  nextAppliedUpdatedAt,
  filterTombstonedIds,
  pruneTombstones,
  type SnapshotSource,
} from './stream-reconcile';
import {
  normalizeTurnHistory,
  mergeOlderHistory,
  mergeLatestHistory,
  sameUserText,
  displayPromptForPending,
  shouldCarryLatestPlanIntoLiveStream,
  promptEndsWithUserPrompt,
  streamPromptMatchesTurnText,
  type Turn,
  type TurnHistoryWindow,
} from './utils';

const SESSION_PAGE_TURNS = 12;
const TOP_LOAD_THRESHOLD_PX = 160;
const BOTTOM_STICK_THRESHOLD_PX = 96;

const EMPTY_TASK_IDS: string[] = [];
const EMPTY_QUEUED_TASKS: QueuedTaskPreview[] = [];
const EMPTY_INTERACTIONS: InteractionSnapshot[] = [];

// Synthetic empty streaming view for the trailing "still working" tail. Rendering it through
// the real TurnDivider + LivePreview pair gives the exact same scaffold a normally-sent task
// shows at turn start (agent identity header + live-status dots), instead of bare dots that
// read as a broken tail when the session is in progress but no stream snapshot is available.
const TRAILING_LOADER_STREAM: LiveStreamView = { phase: 'streaming', text: '', thinking: '' };

const MAX_HISTORY_SNAPSHOTS = 20;
const RECALL_TOMBSTONE_TTL_MS = 60_000;
// How long a local hold (pending send / active stream view) may go without any non-null
// snapshot before a null seed is allowed through to reconcile the panel from disk. Long
// enough that a slow first token or a tool-quiet stretch never trips it (live turns keep
// refreshing the anchor via WS/poll snapshots), short enough that a worker replaced under
// the tab self-heals instead of requiring a manual refresh.
const STREAM_HOLD_TTL_MS = 15_000;
// WS-independent safety net: while the panel believes a task is live, re-seed stream-state
// on this cadence so a silently dead socket still converges (see holdExpired above).
const STREAM_POLL_INTERVAL_MS = 7_000;
// After a turn completes, the streamed reply stays painted (retention gate) until the disk
// transcript settles the turn. The agent CLI can signal `done` a beat before it flushes the
// assistant to the session file (warm process pool / interactive TUI), so the first reload can
// read a user-only tail. Re-pull history on this backoff until the tail turn carries a
// renderable assistant. If it never does, the streamed snapshot remains the answer — the reply
// is never swallowed. (Mirasim gets this for free via a server-side "settled turn always
// included" guarantee; swarmdeck reads the transcript from disk, so it retries instead.)
const DONE_RECONCILE_BACKOFF_MS = [300, 650, 1200, 2200, 3600, 5200];
const historySnapshots = new Map<string, TurnHistoryWindow>();
function snapshotKey(agent: string, sessionId: string) { return `${agent}:${sessionId}`; }

function saveHistorySnapshot(key: string, h: TurnHistoryWindow) {
  historySnapshots.delete(key);
  historySnapshots.set(key, h);
  while (historySnapshots.size > MAX_HISTORY_SNAPSHOTS) {
    historySnapshots.delete(historySnapshots.keys().next().value!);
  }
}

export const SessionPanel = memo(function SessionPanel({
  session, workdir, active = true, onSessionChange, initialPendingPrompt, initialPendingImageUrls, onPendingPromptConsumed,
}: {
  session: SessionInfo;
  workdir: string;
  active?: boolean;
  onSessionChange?: (next: { agent: string; sessionId: string; workdir: string }) => void;
  initialPendingPrompt?: string | null;
  initialPendingImageUrls?: string[];
  onPendingPromptConsumed?: () => void;
}) {
  const locale = useStore(s => s.locale);
  const agentRuntime = useStore(s => s.agentStatus?.agents?.find(a => a.agent === session.agent) ?? null);
  const globalEffort = agentRuntime?.selectedEffort ?? null;
  const globalModel = agentRuntime?.selectedModel ?? null;
  // Provider/profile shown for THIS session must reflect its OWN binding (session.profileId),
  // not the agent's GLOBAL active profile — else a session switched to a native model still shows
  // the global BYOK provider it no longer uses (e.g. "via 豆包火山" on a native gpt-5.5 turn).
  // Tri-state: undefined = legacy/unbound → global; null = native (no provider); string = that profile.
  const modelLayer = useStore(s => s.modelLayer);
  const sessionProfile = session.profileId
    ? (modelLayer?.profiles.find(p => p.id === session.profileId) ?? null)
    : null;
  const sessionProvider = sessionProfile
    ? (modelLayer?.providers.find(pr => pr.id === sessionProfile.providerId) ?? null)
    : null;
  const byokProviderName = session.profileId === undefined
    ? (agentRuntime?.byokProviderName ?? null)
    : (sessionProvider?.name ?? null);
  const byokProfileName = session.profileId === undefined
    ? (agentRuntime?.byokProfileName ?? null)
    : (sessionProfile && sessionProfile.name.trim().toLowerCase() !== sessionProfile.modelId.trim().toLowerCase()
        ? sessionProfile.name
        : null);
  const t = useMemo(() => createT(locale), [locale]);
  const meta = getAgentMeta(session.agent || '');
  const displayState = sessionDisplayState(session);

  const hasInitialPending = !!initialPendingPrompt || !!(initialPendingImageUrls && initialPendingImageUrls.length);
  const [history, setHistory] = useState<TurnHistoryWindow | null>(null);
  const [loading, setLoading] = useState(!hasInitialPending);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [liveStream, setLiveStream] = useState<{
    taskId: string | null;
    phase: 'streaming' | 'done';
    text: string;
    thinking: string;
    activity?: string;
    plan?: StreamPlan | null;
    model?: string | null;
    effort?: string | null;
    previewMeta?: StreamPreviewMeta | null;
    subAgents?: StreamSubAgent[] | null;
    generatingImages?: number;
    artifacts?: SnapshotArtifact[] | null;
    startedAt?: number | null;
    error?: string | null;
    question?: string | null;
    questionBlocks?: MessageBlock[] | null;
  } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamPhase, setStreamPhase] = useState<string | null>(null);
  const [streamPollNonce, setStreamPollNonce] = useState(0);
  const [streamTaskId, setStreamTaskId] = useState<string | null>(null);
  const [queuedTaskIds, setQueuedTaskIds] = useState<string[]>([]);
  const [queuedTasks, setQueuedTasks] = useState<QueuedTaskPreview[]>([]);
  const [interactions, setInteractions] = useState<InteractionSnapshot[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(initialPendingPrompt || null);
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>(initialPendingImageUrls || []);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const pendingTaskIdRef = useRef<string | null>(null);
  pendingTaskIdRef.current = pendingTaskId;
  const pendingPromptRef = useRef<string | null>(pendingPrompt);
  pendingPromptRef.current = pendingPrompt;
  type PendingQueuedSend = { localId: string; taskId: string | null; prompt: string; imageUrls: string[] };
  const [pendingQueuedSends, setPendingQueuedSends] = useState<PendingQueuedSend[]>([]);
  const pendingQueuedSendsRef = useRef<PendingQueuedSend[]>([]);
  pendingQueuedSendsRef.current = pendingQueuedSends;
  const lastSendQueuedLocalIdRef = useRef<string | null>(null);
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const [forkRequest, setForkRequest] = useState<{ atTurn: number } | null>(null);
  const [forkPrompt, setForkPrompt] = useState('');
  const [forkSubmitting, setForkSubmitting] = useState(false);
  const canFork = !!agentRuntime?.capabilities?.fork;
  const submitForkRef = useRef<(() => Promise<void>) | null>(null);
  const pendingImageUrlsRef = useRef<string[]>(initialPendingImageUrls || []);
  const liveStreamRef = useRef(liveStream);
  const streamingRef = useRef(streaming);
  liveStreamRef.current = liveStream;
  streamingRef.current = streaming;
  const historyRef = useRef(history);
  historyRef.current = history;
  const queuedTaskIdsRef = useRef<string[]>(queuedTaskIds);
  queuedTaskIdsRef.current = queuedTaskIds;
  const streamPhaseRef = useRef<string | null>(streamPhase);
  streamPhaseRef.current = streamPhase;
  const scrollRef = useRef<HTMLDivElement>(null);
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const stickToBottomRef = useRef(true);
  const scrollToBottomRef = useRef(false);
  const loadingLatestRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const localStreamPendingRef = useRef(hasInitialPending);
  const clearPendingOnLoadRef = useRef(false);
  const clearLiveStreamOnLoadRef = useRef<{ taskId: string | null } | true | false>(false);
  const initialPendingConsumedRef = useRef(false);
  const promotingRef = useRef(false);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedUpdatedAtRef = useRef(0);
  // Last proof-of-life for the local hold: refreshed by every applied non-null snapshot and by
  // each local send. When a null seed arrives and this is older than the TTL, the task the hold
  // was waiting for no longer exists anywhere (worker replaced under the tab) — see holdExpired.
  const holdAnchorRef = useRef(Date.now());
  const recalledTombstonesRef = useRef<Map<string, number>>(new Map());
  const composerSelectionRef = useRef<{ model: string | null; effort: string | null }>({ model: null, effort: null });
  const handleComposerSelectionChange = useCallback((sel: { model: string | null; effort: string | null }) => {
    composerSelectionRef.current = sel;
  }, []);

  useEffect(() => {
    if (initialPendingConsumedRef.current || !hasInitialPending) return;
