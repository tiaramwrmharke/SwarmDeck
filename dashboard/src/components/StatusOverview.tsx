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
