import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, Label, Modal, ModalHeader, ModelSelect, Select, Spinner } from '../../components/ui';
import { ActionBar } from '../shared';
import { BrandIcon } from '../../components/BrandIcon';
import { useStore } from '../../store';
import type { Locale } from '../../i18n';
import type { ModelLayerSnapshot } from '../models/ModelsTab';

type ProviderKind = 'anthropic' | 'openai' | 'openai-compatible' | 'google';

interface ProviderRow {
  id: string;
  kind: ProviderKind;
  name: string;
  baseURL: string;
}

interface ProfileRow {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
  effort?: string | null;
  maxOutputTokens?: number | null;
}

function formatContextLength(n: number | undefined): string | null {
  if (!n || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M ctx`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K ctx`;
  return `${n} ctx`;
}

function brandIdForProvider(p: { kind: ProviderKind; baseURL: string }): string {
  const url = (() => { try { return new URL(p.baseURL); } catch { return null; } })();
  const host = url?.host.toLowerCase() ?? '';
  const port = url?.port ?? '';
  if ((host.startsWith('127.0.0.1') || host.startsWith('localhost')) && port === '11434') return 'ollama';
  if ((host.startsWith('127.0.0.1') || host.startsWith('localhost')) && port === '8080') return 'mlx';
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

interface Copy {
  sectionTitle: string;
  sectionHint: string;
  addLabel: string;
  empty: string;
  emptyHint: string;
  addModalTitle: string;
  editModalTitle: string;
  fieldName: string;
  fieldNameHint: string;
  fieldProvider: string;
  fieldProviderEmpty: string;
  fieldProviderLockedHint: string;
  fieldModelId: string;
  fieldModelIdHint: string;
  fieldModelIdLoading: string;
  fieldModelIdEmpty: string;
  fieldModelIdToggleManual: string;
  fieldModelIdToggleList: string;
  fieldModelIdSearchPlaceholder: string;
  fieldModelIdSearchEmpty: string;
  fieldModelIdCurrentLabel: string;
  fieldEffort: string;
  effortDefault: string;
  cancel: string;
  save: string;
  saving: string;
  remove: string;
  removeConfirm: string;
  via: string;
}

function getCopy(locale: Locale): Copy {
  if (locale === 'zh-CN') {
    return {
      sectionTitle: '我的模型',
      sectionHint: '把你常用的模型登记成一条条快捷方式，自由起别名。这是一份纯粹的选择列表——智能体会从这里挑模型，但谁选了什么不会反向显示在这里。',
      addLabel: '添加模型',
      empty: '还没有登记任何模型',
      emptyHint: '先在下方"模型供应商"里接入一个供应商，再点上方"添加模型"把常用的几个固定下来。',
      addModalTitle: '添加模型',
      editModalTitle: '编辑模型',
      fieldName: '显示名',
      fieldNameHint: '智能体卡片和 IM 选择菜单里会看到的名称；留空则直接用模型 ID。',
      fieldProvider: '供应商',
      fieldProviderEmpty: '没有可用的供应商；请先在下方"模型供应商"里接入一个。',
      fieldProviderLockedHint: '想换别的供应商？关闭这个窗口，先到下方"模型供应商"里接入。',
      fieldModelId: '模型',
      fieldModelIdHint: '从供应商 /v1/models 拉到的真实模型列表中挑选。',
      fieldModelIdLoading: '正在拉取该供应商的模型列表…',
      fieldModelIdEmpty: '该供应商没有返回模型列表（或还未校验），可手动输入模型 ID。',
      fieldModelIdToggleManual: '改为手动输入',
      fieldModelIdToggleList: '从列表选择',
      fieldModelIdSearchPlaceholder: '搜索模型',
      fieldModelIdSearchEmpty: '没有匹配的模型',
      fieldModelIdCurrentLabel: '当前',
      fieldEffort: '推理强度',
      effortDefault: '（沿用默认）',
      cancel: '取消',
      save: '保存',
      saving: '保存中',
      remove: '删除',
      removeConfirm: '删除这个模型条目？已经选择它的智能体会自动回退到官方认证。',
      via: '经由',
    };
  }
  return {
    sectionTitle: 'My Models',
    sectionHint: 'Register the models you actually use as named shortcuts. A pure selection list — agents pick from here, but who picks what does not bubble back into this view.',
    addLabel: 'Add model',
    empty: 'No models registered yet',
    emptyHint: 'Connect a provider below first, then come back here to pin the few you actually use.',
    addModalTitle: 'Add Model',
    editModalTitle: 'Edit Model',
    fieldName: 'Display name',
    fieldNameHint: 'Shown in agent cards and the IM model picker. Leave empty to use the model id as-is.',
    fieldProvider: 'Provider',
    fieldProviderEmpty: 'No providers configured yet; add one in "Model Providers" below first.',
    fieldProviderLockedHint: 'Want a different provider? Close this dialog and connect one in "Model Providers" below.',
    fieldModelId: 'Model',
    fieldModelIdHint: 'Picked from the provider\'s live /v1/models list.',
    fieldModelIdLoading: 'Loading the provider\'s model list…',
    fieldModelIdEmpty: 'This provider returned no model list (or has not been validated yet). Enter a model ID manually.',
    fieldModelIdToggleManual: 'Enter manually',
    fieldModelIdToggleList: 'Pick from list',
    fieldModelIdSearchPlaceholder: 'Search models',
