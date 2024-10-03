import type {
  AgentStatusResponse,
  AppState,
  BrowserSetupResponse,
  BrowserStatusResponse,
  CliCatalogItem,
  CliStatus,
  InteractionSnapshot,
  OpenTarget,
  GitChangesResult,
  HostInfo,
  LocalModelsProbeResponse,
  OllamaLibraryResponse,
  LsDirResult,
  McpCatalogItem,
  McpHealthResult,
  McpSearchResult,
  McpServerConfig,
  PermissionRequestResult,
  SkillCatalogItem,
  RemoteSkillInfo,
  SessionHubResult,
  SessionMessagesResult,
  SkillInfo,
  StreamPlan,
  MessageBlock,
  QueuedTaskPreview,
  SessionTailMessage,
  SessionsPageResult,
  UsageResult,
  WorkspaceEntry,
  WorkspaceGitResult,
  WeixinLoginStartResult,
  WeixinLoginWaitResult,
  WeixinValidationResult,
} from './types';

export interface AgentAccountInfo {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  active: boolean;
  usage: UsageResult | null;
}

export interface AgentAccountsResponse {
  ok: boolean;
  agent: string;
  supported: boolean;
  accounts: AgentAccountInfo[];
  activeAccountId: string | null;
  /** Default-login quota, read in the same pass as the account rows. */
  nativeUsage: UsageResult | null;
  max: number;
  error?: string;
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

export interface SessionSendRequestOptions extends ApiRequestOptions {
  attachments?: File[];
  model?: string | null;
  profileId?: string | null;
  effort?: string | null;
  previousAgent?: string | null;
  previousSessionId?: string | null;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function forwardAbort(source: AbortSignal | null | undefined, controller: AbortController): () => void {
  if (!source) return () => {};
  const abort = () => controller.abort((source as AbortSignal & { reason?: unknown }).reason);
  if (source.aborted) {
    abort();
    return () => {};
  }
  source.addEventListener('abort', abort, { once: true });
  return () => source.removeEventListener('abort', abort);
}

async function json<T>(url: string, opts: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = opts;
  const controller = new AbortController();
  const cleanupAbort = forwardAbort(signal, controller);
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    const raw = await res.text();
    if (!raw) throw new Error(`Empty response (${res.status})`);
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`Invalid server response (${res.status})`);
    }
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    if (err instanceof Error) throw err;
    throw new Error(String(err ?? 'Request failed'));
  } finally {
    clearTimeout(timer);
    cleanupAbort();
  }
}

function post<T>(url: string, body: unknown, opts: ApiRequestOptions = {}): Promise<T> {
  return json<T>(url, {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  getState: () => json<AppState>('/api/state'),
  getHost: () => json<HostInfo>('/api/host'),
  getAgentStatus: () => json<AgentStatusResponse>('/api/agent-status'),
  // `force` = the explicit refresh button: bypasses the backend failure backoff. Only ever pass
  // it from a deliberate click, never a hover/poll — the probe endpoints rate-limit.
  getAgentAccounts: (agent: string, opts?: ApiRequestOptions & { fresh?: boolean; force?: boolean }) =>
    json<AgentAccountsResponse>(
      `/api/agents/${encodeURIComponent(agent)}/accounts${opts?.force ? '?fresh=1&force=1' : opts?.fresh ? '?fresh=1' : ''}`,
      { timeoutMs: 12_000, ...opts },
    ),
  addAgentAccount: (agent: string, label: string, token: string) =>
    post<{ ok: boolean; account?: AgentAccountInfo; error?: string }>(
      `/api/agents/${encodeURIComponent(agent)}/accounts`, { label, token }),
  updateAgentAccount: (agent: string, id: string, patch: { label?: string; token?: string }) =>
    json<{ ok: boolean; account?: AgentAccountInfo; error?: string }>(
      `/api/agents/${encodeURIComponent(agent)}/accounts/${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
  removeAgentAccount: (agent: string, id: string) =>
    json<{ ok: boolean; error?: string }>(
      `/api/agents/${encodeURIComponent(agent)}/accounts/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }),
  setActiveAgentAccount: (agent: string, accountId: string | null) =>
    post<{ ok: boolean; activeAccountId?: string | null; error?: string }>(
      `/api/agents/${encodeURIComponent(agent)}/active-account`, { accountId }),
  getModelProviders: () => json<{ ok: boolean; providers?: Array<{ id: string; name: string; kind: string; baseURL: string }> }>('/api/models/providers'),
  getModelProfiles: () => json<{ ok: boolean; profiles?: Array<{ id: string; name: string; providerId: string; modelId: string; effort?: string | null }> }>('/api/models/profiles'),
  getModelAgentBindings: () => json<{ ok: boolean; bindings?: Array<{ agent: string; activeProfileId: string | null }> }>('/api/models/agents'),
  getSessions: () => json<Record<string, { sessions: unknown[] }>>('/api/sessions'),
  getSessionsPage: (agent: string, page = 0, limit = 6, opts: ApiRequestOptions = {}) =>
    json<SessionsPageResult>(
      `/api/sessions/${agent}?page=${page}&limit=${limit}`,
      opts,
    ),
  getSessionDetail: (agent: string, sessionId: string, limit = 8, opts: ApiRequestOptions = {}) =>
    json<{ ok: boolean; messages?: SessionTailMessage[]; error?: string }>(
      `/api/session-detail/${agent}/${encodeURIComponent(sessionId)}?limit=${limit}`,
      opts,
    ),
  installAgent: (agent: string, opts?: ApiRequestOptions) =>
    post<{ ok: boolean; error?: string } & AgentStatusResponse>(
      '/api/agent-install',
      { agent },
