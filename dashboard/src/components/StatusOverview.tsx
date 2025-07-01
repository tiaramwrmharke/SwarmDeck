import { resolveAppStatusBadge } from '../app-status';
import { createT, type Locale } from '../i18n';
import { getAgentMeta } from '../utils';
import { Badge, Card, Dot } from './ui';
import type { Agent, AppState, UserConfig } from '../types';

const MODEL_FIELD_BY_AGENT: Record<Agent, keyof UserConfig> = {
  claude: 'claudeModel',
  codex: 'codexModel',
  gemini: 'geminiModel',
  hermes: 'defaultAgent',
};

function getDefaultModel(config: UserConfig, agent: Agent): string {
  return String(config[MODEL_FIELD_BY_AGENT[agent]] || '').trim();
}

export function StatusOverview({
  state,
  locale,
}: {
  state: AppState | null;
  locale: Locale;
}) {
  const t = createT(locale);
  const runtimeStatus = resolveAppStatusBadge(state, t);
  const channels = state?.setupState?.channels || [];
  const readyChannels = channels.filter(channel => channel.ready).length;
  const configuredChannels = channels.filter(channel => channel.configured).length;
  const totalPermissions = Object.keys(state?.permissions || {}).length;
  const grantedPermissions = Object.values(state?.permissions || {}).filter(permission => permission.granted).length;
  const missingPermissions = Math.max(totalPermissions - grantedPermissions, 0);
  const defaultAgent = (state?.bot?.defaultAgent || state?.config.defaultAgent || 'codex') as Agent;
  const defaultModel = state ? getDefaultModel(state.config, defaultAgent) : '';
  const defaultAgentLabel = getAgentMeta(defaultAgent).label;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Card className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-5">{t('sessions.runStatus')}</div>
