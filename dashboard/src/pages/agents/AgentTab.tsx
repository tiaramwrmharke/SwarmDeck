import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { createT, type Locale } from '../../i18n';
import { useStore } from '../../store';
import type { Agent, AgentRuntimeStatus, AgentStatusResponse, ModelInfo } from '../../types';
import { AGENT_ACCEPTED_PROVIDER_KINDS, cn, foldUltraEffort, getAgentMeta } from '../../utils';
import { displayableUsageWindows, usagePercentText, usageTone, usageWindowTone, worstUsageWindow } from '../../usage';
import { BrandIcon } from '../../components/BrandIcon';
import { UsageTooltipContent } from '../../components/UsageTooltip';
import { Badge, Button, Input, Label, Modal, ModalHeader, ModelSelect, Select, Spinner, Tooltip } from '../../components/ui';
import { SectionCard } from '../shared';
import ModelsSection, { useModelLayer, type ModelLayerSnapshot } from '../models/ModelsTab';
import LocalModelsSection, { useLocalBackends } from '../local-models/LocalModelsSection';
import ProfilesSection from '../profiles/ProfilesSection';
import { AccountsPanel } from './AccountsPanel';

const NATIVE_PROVIDER_VALUE = '__native__';
const AGENT_ORDER: Agent[] = ['claude', 'codex', 'gemini', 'hermes'];

interface ProviderModelInfo {
  id: string;
  name?: string;
  created?: number;
  contextLength?: number;
  pricePromptUsd?: number;
  priceCompletionUsd?: number;
}

function formatUsdPerMillion(n: number | undefined): string | null {
  if (n === undefined || !Number.isFinite(n)) return null;
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(1)}`;
}

function formatContextLength(n: number | undefined): string | null {
  if (!n || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M ctx`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K ctx`;
  return `${n} ctx`;
}

function formatCreatedDate(epochSeconds: number | undefined): string | null {
  if (!epochSeconds || !Number.isFinite(epochSeconds)) return null;
  const ms = epochSeconds > 32_000_000_000 ? epochSeconds : epochSeconds * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function buildModelOption(info: ProviderModelInfo): { label: string; description?: string } {
  const label = info.id;
  const parts: string[] = [];
  const friendly = info.name?.trim();
  if (friendly && friendly.toLowerCase() !== info.id.toLowerCase()) parts.push(friendly);
  const prompt = formatUsdPerMillion(info.pricePromptUsd);
  const completion = formatUsdPerMillion(info.priceCompletionUsd);
  if (prompt && completion) parts.push(`${prompt} / ${completion} per 1M`);
  else if (prompt) parts.push(`${prompt} prompt / 1M`);
  const ctx = formatContextLength(info.contextLength);
  if (ctx) parts.push(ctx);
  const released = formatCreatedDate(info.created);
  if (released) parts.push(released);
  return { label, description: parts.length ? parts.join(' · ') : undefined };
}

function isNativeConfigExternal(agent: Agent): boolean {
  return agent === 'hermes';
}

function brandIdForNativeSlug(slug: string | undefined | null): string {
  const s = (slug || '').toLowerCase().trim();
  if (s === 'openrouter') return 'openrouter';
  if (s === 'anthropic') return 'anthropic';
  if (s === 'openai') return 'openai';
  if (s === 'google' || s === 'gemini') return 'google';
  if (s === 'deepseek') return 'deepseek';
  if (s === 'qwen' || s === 'dashscope') return 'qwen';
  if (s === 'doubao' || s === 'volces' || s === 'volcengine') return 'doubao';
  if (s === 'glm' || s === 'zhipu' || s === 'bigmodel') return 'glm';
  if (s === 'minimax') return 'minimax';
  return 'custom';
}

interface BoundProfileInfo {
  profileId: string;
  profileName: string;
  providerId: string;
  providerName: string;
  providerBrand: string;
  modelId: string;
  effort: string | null;
}

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

function buildBoundInfo(layer: ModelLayerSnapshot, agentId: string): BoundProfileInfo | null {
  const profileId = layer.bindings[agentId];
  if (!profileId) return null;
  const profile = layer.profiles.find(p => p.id === profileId);
  if (!profile) return null;
  const provider = layer.providers.find(p => p.id === profile.providerId);
  if (!provider) return null;
  return {
    profileId: profile.id,
    profileName: profile.name,
    providerId: provider.id,
    providerName: provider.name,
    providerBrand: brandIdForProvider(provider),
    modelId: profile.modelId,
    effort: profile.effort || null,
  };
}

type SnapshotState = {
  defaultAgent: Agent;
  agents: AgentRuntimeStatus[];
};

type CopyPack = {
  defaultsTitle: string;
  defaultsHint: string;
  defaultsEditTitle: string;
  defaultsEditHint: string;
  defaultsSaved: string;
  editDefaults: string;
  agentsTitle: string;
  defaultAgent: string;
  installLabel: string;
  versionLabel: string;
  defaultBadge: string;
  installed: string;
  notInstalled: string;
  notInstalledHint: string;
  noModel: string;
  noVersion: string;
  loadFailed: string;
  updateAvailable: string;
  updateSkipped: string;
  updateFailed: string;
  update: string;
  updating: string;
  checkUpdate: string;
  checking: string;
  upToDate: string;
  install: string;
  installing: string;
  profilesTitle: string;
  profilesHint: string;
  modelsTitle: string;
  modelsHint: string;
  localTitle: string;
  localHint: string;
  rowProvider: string;
  rowModel: string;
  rowEffort: string;
  rowWorkflow: string;
  workflowOn: string;
  workflowOff: string;
  workflowHint: string;
  rowAccessMode: string;
  accessSubscription: string;
  accessApi: string;
  accessSubscriptionDesc: string;
  accessApiDesc: string;
  accessModeSwitchNote: string;
  providerNative: string;
  providerNativeFromAgent: string;
  effortDefault: string;
  modelLoading: string;
  modelEmpty: string;
  modelCustomToggle: string;
  modelListToggle: string;
  modelCustomPlaceholder: string;
  modelSearchPlaceholder: string;
  modelSearchEmpty: string;
  modelCurrentLabel: string;
  modelGroupNative: string;
  modelGroupProfiles: string;
  modelPickerEmpty: string;
  modelPickerEmptyHint: string;
  saveChanges: string;
  saving: string;
  saved: string;
  configError: string;
  externalNativeNote: (path: string) => string;
  configure: string;
  configModalTitle: (label: string) => string;
  rowSummaryNative: string;
  rowSummaryNoModel: string;
  rowSummaryNoEffort: string;
  rowWorkflowChipOn: string;
  rowWorkflowChipOff: string;
};

function getCopy(locale: Locale): CopyPack {
  if (locale === 'zh-CN') {
    return {
      defaultsTitle: '新会话默认值',
      defaultsHint: '决定新建对话默认走哪个智能体。具体模型与推理强度由该智能体卡片下的「供应商 / 模型 / 推理强度」决定。',
      defaultsEditTitle: '修改默认智能体',
      defaultsEditHint: '选择新建对话默认走哪个智能体。',
      defaultsSaved: '默认智能体已更新',
      editDefaults: '修改默认',
      agentsTitle: '可用智能体',
      defaultAgent: '默认智能体',
      installLabel: '安装状态',
      versionLabel: '版本',
      defaultBadge: '默认',
      installed: '已安装',
      notInstalled: '未安装',
      notInstalledHint: '安装该智能体的本地 CLI 后即可在此配置供应商与模型。',
      noModel: '未设置',
      noVersion: '版本未知',
      loadFailed: '无法加载智能体状态',
      updateAvailable: '有新版本',
      updateSkipped: '自动更新已跳过',
      updateFailed: '自动更新失败',
      update: '升级',
      updating: '升级中…',
      checkUpdate: '检查更新',
      checking: '检查中…',
      upToDate: '已是最新',
      install: '安装',
      installing: '安装中…',
      profilesHint: '把你常用的模型登记成一条条快捷方式，自由起别名。这是一份纯粹的选择列表——智能体（包括 Hermes）会从这里挑模型，但选了谁不会反向显示在这里。',
      profilesTitle: '我的模型',
      modelsTitle: '模型供应商',
      modelsHint: '接入 BYOK 供应商；接入后可在上方"我的模型"里挑选具体模型并固定下来。',
      localTitle: '本地模型',
      localHint: '在本机检测 Ollama / mlx-lm 并按内存推荐合适的开源模型；接入后会作为一个供应商出现在智能体卡片中。',
      rowProvider: '供应商',
      rowModel: '模型',
      rowEffort: '推理强度',
      rowWorkflow: '多智能体编排',
      workflowOn: '开启',
      workflowOff: '关闭（默认）',
      workflowHint: '开启后，遇到大型多步任务（广度调研、大规模重构 / 审计、跨多文件评审）智能体可自行编排多个子智能体并行处理。关闭时彻底禁用 Workflow 工具，普通对话不受影响。',
      rowAccessMode: '接入模式',
      accessSubscription: 'TUI 模式',
      accessApi: '标准 · `claude -p`',
      accessSubscriptionDesc: '把 Claude Code 当交互式终端来跑，借标准 Claude 的 TUI 能力解析每一轮输出，计入 Pro/Max 订阅额度。',
      accessApiDesc: '标准的 headless 接入：直接以 `claude -p` 调用并读取结构化输出。长期会计入独立的 API 计费额度池（当前暂未生效，仍复用你现有的 Claude 登录）。',
      accessModeSwitchNote: '切换仅对新建会话/轮次生效，进行中的任务不受影响。',
      providerNative: '官方（CLI 内置认证）',
      providerNativeFromAgent: '智能体自身配置',
      effortDefault: '默认',
      modelLoading: '正在拉取模型列表…',
      modelEmpty: '该供应商未返回模型列表，请使用自定义输入。',
      modelCustomToggle: '改为自定义输入',
      modelListToggle: '从列表选择',
      modelCustomPlaceholder: 'anthropic/claude-sonnet-4',
      modelSearchPlaceholder: '搜索模型',
      modelSearchEmpty: '没有匹配的模型',
      modelCurrentLabel: '当前',
      modelGroupNative: '官方',
      modelGroupProfiles: '我的模型',
      modelPickerEmpty: '没有可选模型',
      modelPickerEmptyHint: '该智能体的官方模型列表为空，且你还没有登记任何"我的模型"。',
      saveChanges: '保存',
      saving: '保存中…',
      saved: '已保存',
      configError: '保存失败',
      externalNativeNote: path => `Hermes 当前从 ${path || '~/.hermes/config.yaml'} 读取这些值；切换为某个 BYOK 供应商可由 swarmdeck 接管。`,
      configure: '配置',
      configModalTitle: label => `配置 ${label}`,
      rowSummaryNative: '官方认证',
