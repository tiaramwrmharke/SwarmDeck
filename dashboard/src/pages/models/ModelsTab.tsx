import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, Label, Modal, ModalHeader, Select, Spinner } from '../../components/ui';
import { ActionBar, SectionCard } from '../shared';
import { BrandIcon } from '../../components/BrandIcon';
import { useStore } from '../../store';
import { cn, getAgentMeta } from '../../utils';
import type { Locale } from '../../i18n';
import type { LocalBackendStatus } from '../../types';

type ProviderKind = 'anthropic' | 'openai' | 'openai-compatible' | 'google';

interface ProviderRow {
  id: string;
  kind: ProviderKind;
  name: string;
  baseURL: string;
  credential: { source: string; summary: string };
  validation: ValidationStatus | null;
  createdAt: string;
  updatedAt: string;
}

interface ValidationStatus {
  state: 'unknown' | 'ready' | 'invalid' | 'error';
  detail: string;
  checkedAt: string;
  modelCount?: number;
}

interface ProfileRow {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
  effort?: string | null;
  maxOutputTokens?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ProviderTemplate {
  id: string;
  kind: ProviderKind;
  name: { zh: string; en: string };
  blurb: { zh: string; en: string };
  baseURL: string;
  envVar: string;
  defaultModel?: string;
}

const TEMPLATES: ProviderTemplate[] = [
  {
    id: 'openrouter',
    kind: 'openai-compatible',
    name: { zh: 'OpenRouter', en: 'OpenRouter' },
    blurb: { zh: '一个 key 通行 300+ 模型', en: 'One key, 300+ models' },
    baseURL: 'https://openrouter.ai/api/v1',
    envVar: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-sonnet-4',
  },
  {
    id: 'qwen',
    kind: 'openai-compatible',
    name: { zh: '通义千问 Qwen', en: 'Alibaba Qwen' },
    blurb: { zh: '阿里云 DashScope', en: 'Alibaba DashScope' },
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envVar: 'DASHSCOPE_API_KEY',
    defaultModel: 'qwen3-max',
  },
  {
    id: 'doubao',
    kind: 'openai-compatible',
    name: { zh: '豆包 Seed', en: 'Doubao Seed' },
    blurb: { zh: '字节跳动 · 火山方舟', en: 'ByteDance Volcengine Ark' },
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    envVar: 'ARK_API_KEY',
    defaultModel: 'doubao-seed-1-6-250615',
  },
  {
    id: 'glm',
    kind: 'openai-compatible',
    name: { zh: '智谱 GLM', en: 'Zhipu GLM' },
    blurb: { zh: '智谱 · Z.AI', en: 'Zhipu · Z.AI' },
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    envVar: 'ZAI_API_KEY',
    defaultModel: 'glm-4.6',
  },
  {
    id: 'minimax',
    kind: 'openai-compatible',
    name: { zh: 'MiniMax', en: 'MiniMax' },
    blurb: { zh: 'MiniMax 官方 API', en: 'MiniMax official API' },
    baseURL: 'https://api.minimax.chat/v1',
    envVar: 'MINIMAX_API_KEY',
    defaultModel: 'MiniMax-M2',
  },
  {
    id: 'deepseek',
    kind: 'openai-compatible',
    name: { zh: 'DeepSeek', en: 'DeepSeek' },
    blurb: { zh: '深度求索官方 API', en: 'DeepSeek official API' },
    baseURL: 'https://api.deepseek.com',
    envVar: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'anthropic',
    kind: 'anthropic',
    name: { zh: 'Anthropic 直连', en: 'Anthropic Direct' },
    blurb: { zh: 'Claude 官方 API', en: 'Official Claude API' },
    baseURL: 'https://api.anthropic.com',
    envVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5',
  },
  {
    id: 'google',
    kind: 'google',
    name: { zh: 'Google AI Studio', en: 'Google AI Studio' },
    blurb: { zh: 'Gemini 官方 API', en: 'Official Gemini API' },
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    envVar: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-pro',
  },
  {
    id: 'openai',
    kind: 'openai',
    name: { zh: 'OpenAI 直连', en: 'OpenAI Direct' },
    blurb: { zh: 'OpenAI 官方 API', en: 'Official OpenAI API' },
    baseURL: 'https://api.openai.com/v1',
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-5',
  },
  {
    id: 'custom',
    kind: 'openai-compatible',
    name: { zh: '自定义端点', en: 'Custom' },
    blurb: { zh: '其他 OpenAI 兼容端点', en: 'Other OpenAI-compatible endpoint' },
    baseURL: '',
    envVar: '',
  },
];

interface Copy {
  sectionTitle: string;
  sectionHint: string;
  addLabel: string;

  validate: string;
  validating: string;
  edit: string;
  remove: string;
  removeConfirm: string;
  unbound: string;
  boundOne: string;
  boundN: (n: number) => string;
  notConnected: string;
  modelsAvailable: (count: number) => string;

  modalAddTitle: string;
  modalAddHint: (template: string | null) => string;
  modalEditTitle: string;
  modalEditHint: string;

  fieldName: string;
  fieldNamePlaceholder: string;
  fieldKind: string;
  fieldBaseURL: string;
  fieldCredentialSource: string;
  fieldApiKey: string;
  fieldApiKeyHint: string;
  fieldEnvVar: string;
  fieldCommand: string;
  fieldModelId: string;
  fieldEffort: string;
  fieldEffortHelp: string;
  effortHermesNote: string;

  credPaste: string;
  credEnv: string;
  credCommand: string;
  effortDefault: string;
  cancel: string;
  save: string;
  saving: string;

  validationReady: string;
  validationInvalid: string;
  validationError: string;
  validationUnvalidated: string;
  providerOnlyHint: string;
  credentialLabel: string;
}

function getCopy(locale: Locale): Copy {
  if (locale === 'zh-CN') {
    return {
      sectionTitle: '模型供应商',
      sectionHint: '连接你自己的模型供应商，凭据加密存入系统 Keychain，可绑定到任意一个智能体。',
      addLabel: '接入新供应商',
      validate: '校验',
      validating: '校验中',
      edit: '编辑',
      remove: '删除',
      removeConfirm: '删除该供应商？已绑定的智能体会自动恢复为官方 Auth。',
      unbound: '尚未被任何智能体使用',
      boundOne: '已绑定',
      boundN: n => `${n} 个智能体在用`,
      notConnected: '未接入',
      modalAddTitle: '接入模型供应商',
      modalAddHint: tpl => tpl ? `已套用 ${tpl} 模板，仅需粘贴 API Key。` : '填入端点和凭据，保存后即可在智能体卡片上选用。',
      modalEditTitle: '编辑供应商配置',
      modalEditHint: '修改端点、凭据或模型参数。修改凭据会清空已校验状态。',
      fieldName: '配置名称',
      fieldNamePlaceholder: '例如：OpenRouter · 个人',
      fieldKind: 'API 类型',
      fieldBaseURL: 'Base URL',
      fieldCredentialSource: '凭据来源',
      fieldApiKey: 'API Key',
      fieldApiKeyHint: '通过 @napi-rs/keyring 写入系统 Keychain，setting.json 仅保存引用。',
      fieldEnvVar: '环境变量名',
      fieldCommand: '获取命令（执行结果作为 key）',
      fieldModelId: '模型 ID',
      fieldEffort: '推理强度',
      fieldEffortHelp: '可用范围由模型决定，留空表示沿用模型默认值。',
      effortHermesNote: 'Hermes 当前从 ~/.hermes/config.yaml 读取推理强度，Profile 上的 effort 暂仅做记录。',
      credPaste: '粘贴 API Key（推荐，写入系统 Keychain）',
      credEnv: '从环境变量读取',
      credCommand: '运行命令获取（1Password / pass / gh 等）',
      effortDefault: '（沿用默认）',
      cancel: '取消',
      save: '保存',
      saving: '保存中',
      validationReady: '已就绪',
      validationInvalid: '凭据无效',
      validationError: '网络/服务错误',
      validationUnvalidated: '未校验',
      providerOnlyHint: '保存后回到智能体卡片，点击「BYOK」选择具体的模型与推理强度。',
      credentialLabel: '凭据',
      modelsAvailable: count => `可用 ${count} 个模型`,
    };
  }
  return {
    sectionTitle: 'Model Providers',
    sectionHint: 'Connect your own model providers. Keys are encrypted in the OS keychain and can be bound to any agent.',
    addLabel: 'Add provider',
    validate: 'Validate',
    validating: 'Validating',
    edit: 'Edit',
    remove: 'Remove',
    removeConfirm: 'Remove this provider? Bound agents will fall back to native auth.',
    unbound: 'Not used by any agent yet',
    boundOne: 'Bound to',
    boundN: n => `${n} agents in use`,
    notConnected: 'Not connected',
    modalAddTitle: 'Connect Model Provider',
    modalAddHint: tpl => tpl ? `Pre-filled from the ${tpl} template — just paste your API key.` : 'Enter endpoint and credential. After saving, choose models on the agent cards above.',
    modalEditTitle: 'Edit Provider',
    modalEditHint: 'Update the endpoint, credential, or model. Changing the credential clears the validated state.',
    fieldName: 'Display name',
    fieldNamePlaceholder: 'e.g. OpenRouter · Personal',
    fieldKind: 'API kind',
    fieldBaseURL: 'Base URL',
