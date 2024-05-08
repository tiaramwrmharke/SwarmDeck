export type Agent = 'claude' | 'codex' | 'gemini' | 'hermes';
export type OpenTarget = 'vscode' | 'cursor' | 'windsurf' | 'finder' | 'default';

export interface AgentInfo {
  agent: Agent;
  label: string;
  installed: boolean;
  version?: string;
  installCommand?: string;
}

export interface ModelInfo {
  id: string;
  alias: string | null;
}

export interface UsageWindowInfo {
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  resetAfterSeconds: number | null;
  status: string | null;
  detail?: string | null;
}

export interface UsageResult {
  ok: boolean;
  agent: Agent;
  source: string | null;
  capturedAt: string | null;
  status: string | null;
  windows: UsageWindowInfo[];
  error: string | null;
  // Coarse stand-in served while the full quota endpoint is rate-limited: only 5h/7d, no
  // per-model weekly (Fable) or Extra spend. Surfaces show a "limited" hint when set.
  degraded?: boolean;
  planType?: string | null;
  creditsSummary?: string | null;
  resetCreditsAvailable?: number | null;
}

export interface AgentNativeConfig {
  model: string;
  provider: string;
  baseURL: string | null;
  effort: string | null;
  configPath: string;
  source: string;
}

export interface AgentInstallInfo {
  method: 'npm' | 'manual';
  command: string;
  docsUrl?: string;
  note?: string;
}

// Wire shape of one reasoning-effort level; the authoritative catalog lives in the backend
// (core/config/runtime-config.ts effortOptionsFor). The dashboard only consumes these.
export interface EffortLevel { id: string; label: string }

export interface AgentRuntimeStatus extends AgentInfo {
  install?: AgentInstallInfo | null;
  selectedModel: string | null;
  selectedEffort: string | null;
  // Authoritative effort levels for this agent's current (agent, model), from the backend
  // catalog. Empty/absent ⇒ no effort selector. Do not hardcode a list in the frontend.
  effortOptions?: EffortLevel[];
  nativeSelectedModel?: string | null;
  nativeSelectedEffort?: string | null;
  workflowEnabled?: boolean;
  claudeAccessMode?: 'subscription' | 'api';
  isDefault: boolean;
  models: ModelInfo[];
  usage: UsageResult | null;
  nativeConfig?: AgentNativeConfig | null;
  capabilities?: { fork?: boolean; modelSwitch?: boolean; workflow?: boolean };
  byokProviderName?: string | null;
  byokProfileName?: string | null;
  byokModels?: { id: string; alias: string | null }[] | null;
  latestVersion?: string | null;
  updateAvailable?: boolean;
  updateStatus?: string | null;
  updateDetail?: string | null;
}

export interface AgentStatusResponse {
  defaultAgent: Agent;
  workdir: string;
  agents: AgentRuntimeStatus[];
}

export type ChannelStatus = 'ready' | 'missing' | 'invalid' | 'error' | 'checking';

export interface ChannelSetupState {
  channel: 'telegram' | 'feishu' | 'weixin' | 'slack' | 'discord' | 'dingtalk' | 'wecom';
  configured: boolean;
  ready: boolean;
  validated: boolean;
  status: ChannelStatus;
  detail: string;
}

export interface SetupState {
  agents: AgentInfo[];
  channel: string;
  tokenProvided: boolean;
  channels?: ChannelSetupState[];
}

export interface PermissionStatus {
  granted: boolean;
  checkable: boolean;
  detail: string;
}

export type PermissionRequestAction = 'already_granted' | 'prompted' | 'opened_settings' | 'unsupported';

export interface PermissionRequestResult {
  ok: boolean;
  action: PermissionRequestAction;
  granted: boolean;
  requiresManualGrant: boolean;
  error?: string;
}

export interface BotStatus {
  workdir: string;
  defaultAgent: Agent;
  uptime: number;
  connected: boolean;
  stats: {
    totalTurns: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  activeTasks: number;
  sessions: number;
}

export interface UserConfig {
  defaultAgent?: Agent;
  claudeModel?: string;
  claudeReasoningEffort?: string;
  codexModel?: string;
  codexReasoningEffort?: string;
  geminiModel?: string;
  workdir?: string;
  telegramBotToken?: string;
  telegramAllowedChatIds?: string;
  feishuAppId?: string;
  feishuAppSecret?: string;
  weixinBaseUrl?: string;
  weixinBotToken?: string;
  weixinAccountId?: string;
  slackBotToken?: string;
  slackAppToken?: string;
  discordBotToken?: string;
  dingtalkClientId?: string;
  dingtalkClientSecret?: string;
  wecomBotId?: string;
  wecomBotSecret?: string;
  wecomEndpoint?: string;
  channels?: string[];
  browserEnabled?: boolean;
  browserHeadless?: boolean;
}

export interface WeixinValidationResult {
  ok: boolean;
  error?: string | null;
  normalizedBaseUrl?: string;
  account?: {
    accountId: string;
    baseUrl: string;
  } | null;
}

export interface WeixinLoginStartResult {
  ok: boolean;
  sessionKey: string;
  qrcodeUrl?: string;
  message: string;
  error?: string;
}

export interface WeixinLoginWaitResult {
  ok: boolean;
  connected: boolean;
  status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'error';
  message: string;
  qrcodeUrl?: string;
  botToken?: string;
  accountId?: string;
  userId?: string;
  baseUrl?: string;
  error?: string;
}

export interface AppState {
  version: string;
  ready: boolean;
  configExists: boolean;
  config: UserConfig;
  runtimeWorkdir: string;
  setupState: SetupState | null;
  permissions: Record<string, PermissionStatus>;
  hostApp?: string | null;
  platform: string;
  pid: number;
  nodeVersion?: string;
  bot: BotStatus | null;
}

export interface HostInfo {
  hostName: string;
  cpuModel: string;
  cpuCount: number;
  totalMem: number;
  freeMem: number;
  memoryUsed?: number;
  memoryPercent?: number;
  platform: string;
  arch: string;
  cpuUsage?: { usedPercent: number };
  loadAverage?: { one: number; five: number; fifteen: number } | null;
  disk?: { used: string; total: string; percent: string };
  battery?: { percent: string; state: string };
}

export type LocalBackendId = 'ollama' | 'mlx';
export type LocalBackendOs = 'darwin' | 'linux' | 'win';

export interface LocalBackendInstallCommand {
  label?: string;
  cmd: string;
}

export interface LocalBackendInstallSpec {
  darwin?: LocalBackendInstallCommand[];
  linux?: LocalBackendInstallCommand[];
  win?: LocalBackendInstallCommand[];
  docs?: string;
}

export interface LocalBackendStatus {
