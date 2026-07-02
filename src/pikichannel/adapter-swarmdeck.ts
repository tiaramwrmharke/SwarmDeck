import { EventEmitter } from 'node:events';
import { runtime, type DashboardEvent } from '../dashboard/runtime.js';
import {
  queueDashboardSessionTask,
  stopSessionTasks,
  steerSessionTask,
  cancelSessionTask,
  interactionSelectOption,
  interactionSubmitText,
  interactionSkip,
  interactionCancel,
} from '../dashboard/session-control.js';
import { loadUserConfig } from '../core/config/user-config.js';
import { VERSION } from '../core/version.js';
import type { StreamSnapshot } from '../bot/bot.js';
import type {
  HostCapability,
  SessionMeta,
  UniversalInteraction,
  UniversalSnapshot,
} from './protocol.js';
import type { PromptCommand, CommandResult, SessionSource, TunnelRequest, TunnelResponse } from './host.js';

const CAPABILITIES: HostCapability[] = ['prompt', 'stop', 'steer', 'recall', 'interact', 'subscribe-all', 'artifacts', 'tunnel'];

export type RequestForwarder = (req: TunnelRequest) => Promise<TunnelResponse>;

function splitKey(sessionKey: string): { agent: string; sessionId: string } {
  const idx = sessionKey.indexOf(':');
  if (idx < 0) return { agent: '', sessionId: sessionKey };
  return { agent: sessionKey.slice(0, idx), sessionId: sessionKey.slice(idx + 1) };
}

function projectInteractions(snap: StreamSnapshot): UniversalInteraction[] | undefined {
  if (!snap.interactions?.length) return undefined;
  return snap.interactions.map((it) => ({
    promptId: it.promptId,
    kind: it.kind,
    title: it.title,
    hint: it.hint,
    currentIndex: it.currentIndex,
    questions: (it.questions || []).map((q: any) => ({
      id: String(q.id),
      header: q.header ?? undefined,
      text: String(q.prompt ?? q.text ?? q.label ?? ''),
      type: q.type,
      choices: Array.isArray(q.options ?? q.choices)
        ? (q.options ?? q.choices).map((c: any) => ({ label: String(c.label ?? c), description: c.description ?? undefined, value: c.value ?? c.label }))
        : undefined,
      allowFreeform: q.allowFreeform,
      allowEmpty: q.allowEmpty,
    })),
  }));
}

function compact<T extends Record<string, any>>(obj: T): T {
