import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { AGENT_ACCEPTED_PROVIDER_KINDS, cn, foldUltraEffort, getAgentMeta, isPendingSessionId, shortenModel } from '../../utils';
import { usageWindowTone, worstUsageWindow } from '../../usage';
import { api } from '../../api';
import { useStore, type ModelLayer } from '../../store';
import { Spinner } from '../../components/ui';
import { BrandIcon } from '../../components/BrandIcon';
import { visibleQueuedIds } from './queue-logic';
import {
  makeComposerImageAttachment,
  revokeComposerAttachments,
  formatFileSize,
  copyImageFile,
  parseSessionKey,
  isLikelyImageFile,
  extractImageDataUrlsFromHtml,
  dataUrlToImageFile,
  readImagesFromAsyncClipboard,
  type ComposerImageAttachment,
} from './utils';
import type { Agent, SessionInfo, AgentRuntimeStatus, SkillInfo, EffortLevel, QueuedTaskPreview } from '../../types';

type CascadeStep = 'closed' | 'agent' | 'model';

const draftStore = new Map<string, { text: string; files: File[] }>();
function draftKey(agent: string, sessionId: string) { return `${agent}:${sessionId}`; }

const EMPTY_PROVIDERS: ModelLayer['providers'] = [];
const EMPTY_PROFILES: ModelLayer['profiles'] = [];
const EMPTY_ACTIVE_PROFILES: ModelLayer['activeProfiles'] = {};

function brandIdForProvider(p: { kind: string; baseURL: string }): string {
  const host = (() => { try { return new URL(p.baseURL).host.toLowerCase(); } catch { return ''; } })();
  if (host.includes('openrouter')) return 'openrouter';
  if (host.includes('anthropic')) return 'anthropic';
  if (host.includes('deepseek')) return 'deepseek';
  if (host.includes('googleapis') || host.includes('vertex')) return 'google';
  if (host.includes('openai.com')) return 'openai';
  if (host.includes('dashscope') || host.includes('qwen') || host.includes('aliyun')) return 'qwen';
  if (host.includes('volces') || host.includes('volcengine') || host.includes('doubao')) return 'doubao';
  if (host.includes('bigmodel') || host.includes('zhipu') || host.includes('z.ai')) return 'glm';
  if (host.includes('minimax')) return 'minimax';
  if (p.kind === 'anthropic') return 'anthropic';
  if (p.kind === 'google') return 'google';
  if (p.kind === 'openai') return 'openai';
  return 'custom';
}

export const InputComposer = memo(function InputComposer({ session, workdir, onStreamQueued, onSendStart, onSendTaskAssigned, onSessionChange, t, streamPhase, streamTaskId, queuedTaskIds, queuedTasks, pendingQueuedSends, onRecall, onSteer, onStopAll, editDraft, onEditDraftConsumed, onSelectionChange }: {
  session: SessionInfo;
  workdir: string;
  onStreamQueued: () => void;
  onSendStart: (prompt: string, imageUrls?: string[]) => void;
  onSendTaskAssigned?: (taskId: string) => void;
  onSessionChange?: (next: { agent: string; sessionId: string; workdir: string }) => void;
  t: (k: string) => string;
  streamPhase: string | null;
  streamTaskId?: string | null;
  queuedTaskIds?: string[];
  queuedTasks?: QueuedTaskPreview[];
  pendingQueuedSends?: Array<{ taskId: string | null; prompt: string; imageUrls?: string[] }>;
  onRecall?: (taskId: string) => void;
  onSteer?: (taskId: string) => void;
  onStopAll?: () => void | Promise<void>;
  editDraft?: string | null;
  onEditDraftConsumed?: () => void;
  onSelectionChange?: (sel: { model: string | null; effort: string | null }) => void;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [localTaskId, setLocalTaskId] = useState<string | null>(null);
  const [recallingIds, setRecallingIds] = useState<Set<string>>(() => new Set());
  const [steeringIds, setSteeringIds] = useState<Set<string>>(() => new Set());
  const lastSentRef = useRef<{ prompt: string; files: File[] }>({ prompt: '', files: [] });
  const storeAgents = useStore(s => s.agentStatus?.agents ?? null);
  const [agents, setAgents] = useState<AgentRuntimeStatus[]>(storeAgents || []);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null | undefined>(undefined);
  const [selectedEffort, setSelectedEffort] = useState('');
  const [imageAttachments, setImageAttachments] = useState<ComposerImageAttachment[]>([]);
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);
  const [queuedPreviewUrl, setQueuedPreviewUrl] = useState<string | null>(null);
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [pendingEffort, setPendingEffort] = useState<string | null>(null);
  const [pendingProfileSelection, setPendingProfileSelection] = useState<string | null | undefined>(undefined);
  const [cascadeStep, setCascadeStep] = useState<CascadeStep>('closed');
  const [cascadePos, setCascadePos] = useState<{ left: number; bottom: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const attachmentsRef = useRef<ComposerImageAttachment[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillMenuIndex, setSkillMenuIndex] = useState(0);
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const refreshAgentStatus = useStore(s => s.refreshAgentStatus);

  // Model layer (providers/profiles/agent bindings) is global config shared by every panel;
  // it lives in the store and is fetched once, not re-pulled per composer mount.
  const modelLayer = useStore(s => s.modelLayer);
  const ensureModelLayer = useStore(s => s.ensureModelLayer);
  const refreshModelLayer = useStore(s => s.refreshModelLayer);
  const providers = modelLayer?.providers ?? EMPTY_PROVIDERS;
  const profiles = modelLayer?.profiles ?? EMPTY_PROFILES;
  const activeProfiles = modelLayer?.activeProfiles ?? EMPTY_ACTIVE_PROFILES;

  useEffect(() => { void ensureModelLayer(); }, [ensureModelLayer]);

  useEffect(() => { if (storeAgents?.length) setAgents(storeAgents); }, [storeAgents]);
  useEffect(() => { attachmentsRef.current = imageAttachments; }, [imageAttachments]);

  const dk = draftKey(session.agent || '', session.sessionId);
  const dkRef = useRef(dk);
  dkRef.current = dk;
  useEffect(() => {
    const saved = draftStore.get(dk);
    if (saved) {
      draftStore.delete(dk);
      if (saved.text) setInput(saved.text);
      if (saved.files.length) setImageAttachments(saved.files.map(makeComposerImageAttachment));
    }
    return () => {
      const text = inputRef.current?.value || '';
      const files = attachmentsRef.current.map(a => a.file);
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.previewUrl);
      if (text || files.length) draftStore.set(dkRef.current, { text, files });
      else draftStore.delete(dkRef.current);
    };
  }, [dk]);

  const prevSessionRef = useRef({ agent: session.agent || '', sessionId: session.sessionId });
  useEffect(() => {
    const prev = prevSessionRef.current;
    const curr = { agent: session.agent || '', sessionId: session.sessionId };
    prevSessionRef.current = curr;
    const isPromotion = prev.agent === curr.agent
      && isPendingSessionId(prev.sessionId) && !isPendingSessionId(curr.sessionId);
    if (isPromotion) return;
    setSelectedAgent('');
    setSelectedModel('');
    setSelectedProfileId(undefined);
    setSelectedEffort('');
    setPendingAgent(null);
    setPendingModel(null);
    setPendingEffort(null);
    setCascadeStep('closed');
  }, [session.agent, session.sessionId]);

  useEffect(() => {
    if (editDraft != null) {
      setInput(editDraft);
      onEditDraftConsumed?.();
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.setSelectionRange(editDraft.length, editDraft.length); }
      });
    }
  }, [editDraft, onEditDraftConsumed]);

  useEffect(() => {
    if (!workdir) return;
    let cancelled = false;
    api.getSkills(workdir).then(res => {
      if (!cancelled && res.ok) setSkills(res.skills);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [workdir]);

  const skillQuery = skillMenuOpen ? (() => {
    const match = input.match(/^\/(\S*)$/);
    return match ? match[1].toLowerCase() : null;
  })() : null;
  const filteredSkills = skillQuery !== null
    ? skills.filter(s => s.name.toLowerCase().includes(skillQuery) || (s.label && s.label.toLowerCase().includes(skillQuery)))
    : [];

  useEffect(() => { setSkillMenuIndex(0); }, [skillMenuOpen, input]);

  useEffect(() => {
    if (!skillMenuOpen || !skillMenuRef.current) return;
    const item = skillMenuRef.current.querySelector(`[data-skill-idx="${skillMenuIndex}"]`);
    if (item) (item as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [skillMenuIndex, skillMenuOpen]);

  useEffect(() => {
    if (!skillMenuOpen) return;
    const h = (e: MouseEvent) => {
      if (skillMenuRef.current?.contains(e.target as Node)) return;
      if (inputRef.current?.contains(e.target as Node)) return;
      setSkillMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [skillMenuOpen]);

  useEffect(() => {
    if (cascadeStep === 'closed') return;
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const portal = document.getElementById('cascade-portal');
      if (portal?.contains(target)) return;
      setCascadeStep('closed'); setPendingAgent(null); setPendingModel(null); setPendingEffort(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [cascadeStep]);

  useLayoutEffect(() => {
    if (cascadeStep === 'closed' || !triggerRef.current) { setCascadePos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    setCascadePos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
  }, [cascadeStep]);

  const firstQueuedFromSnapshot = queuedTaskIds && queuedTaskIds.length ? queuedTaskIds[0] : null;
  useEffect(() => {
    if (localTaskId) {
      if (firstQueuedFromSnapshot) setLocalTaskId(null);
      else if (streamPhase !== null && streamPhase !== 'queued') setLocalTaskId(null);
    }
  }, [streamPhase, localTaskId, firstQueuedFromSnapshot]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const addImageAttachments = useCallback((files: ArrayLike<File> | null | undefined) => {
    const nextFiles = Array.from(files || []).filter(isLikelyImageFile);
    if (!nextFiles.length) return;
    setImageAttachments(prev => [...prev, ...nextFiles.map(makeComposerImageAttachment)]);
  }, []);

  const clearImageAttachments = useCallback(() => {
    setPreviewImageId(null);
    setImageAttachments(prev => {
      revokeComposerAttachments(prev);
      return [];
    });
  }, []);

  const removeImageAttachment = useCallback((id: string) => {
    setImageAttachments(prev => {
      const target = prev.find(item => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(item => item.id !== id);
    });
    setPreviewImageId(current => current === id ? null : current);
  }, []);

  const handleSend = useCallback(() => {
    const prompt = input.trim();
    const attachments = imageAttachments.map(item => item.file);
    if ((!prompt && attachments.length === 0) || sending) return;
    const targetAgent = selectedAgent
      || session.agent
      || agents.find(a => a.isDefault)?.agent
      || '';
    if (!targetAgent) return;
    const targetStatus = agents.find(a => a.agent === targetAgent) || null;
    const sendOwnsSessionAgent = !!session.agent && targetAgent === session.agent;
    const targetModel = (selectedModel
      || (sendOwnsSessionAgent ? (session.model || '') : '')
      || targetStatus?.selectedModel
      || '').trim() || null;
    const targetProfileId: string | null | undefined = selectedProfileId !== undefined
      ? selectedProfileId
      : (sendOwnsSessionAgent && session.model ? (session.profileId ?? null) : undefined);
    const targetEffort = targetAgent === 'gemini'
      ? null
      : ((selectedEffort
        || (sendOwnsSessionAgent ? foldUltraEffort(targetAgent, session.thinkingEffort, session.workflowEnabled) : '')
        || foldUltraEffort(targetAgent, targetStatus?.selectedEffort, targetStatus?.workflowEnabled)
        || '').trim() || null);
    const isAgentSwitch = targetAgent !== session.agent;
    const targetSessionId = isAgentSwitch ? '' : session.sessionId;
    const previousAgent = isAgentSwitch && session.agent ? session.agent : null;
    const previousSessionId = isAgentSwitch && session.sessionId ? session.sessionId : null;
    setSending(true);
    lastSentRef.current = { prompt, files: attachments };
    setInput('');
    draftStore.delete(dkRef.current);
    const previewUrls = attachments.length ? attachments.map(f => URL.createObjectURL(f)) : undefined;
    clearImageAttachments();
    onSendStart(prompt, previewUrls);
    onStreamQueued();
    api.sendSessionMessage(workdir, targetAgent, targetSessionId, prompt, {
      attachments,
      model: targetModel,
