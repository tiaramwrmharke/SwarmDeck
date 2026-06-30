import { useCallback, useEffect, useState } from 'react';
import { api, type AgentAccountInfo } from '../../api';
import { Button, Input, Label, Spinner } from '../../components/ui';
import { UsageBars } from '../../components/UsageBars';
import { useStore } from '../../store';
import type { UsageResult } from '../../types';

// Per-agent local subscription accounts. Each account is a named `claude setup-token` token;
// switching the active account injects it as CLAUDE_CODE_OAUTH_TOKEN for new turns (the agent
// keeps using its normal config home). Shown as a click-to-switch card grid on the claude
// agent config page.
type FormState = { mode: 'add' | 'token'; id?: string; label: string; token: string; saving: boolean };
type L = (zh: string, en: string) => string;

export function AccountsPanel({ agentId }: { agentId: string }) {
  const locale = useStore(s => s.locale);
  const toast = useStore(s => s.toast);
  const agentStatus = useStore(s => s.agentStatus);
  const L: L = (zh, en) => (locale === 'en' ? en : zh);

  const [accounts, setAccounts] = useState<AgentAccountInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [max, setMax] = useState(5);
  const [loading, setLoading] = useState(true);
  const [refreshingUsage, setRefreshingUsage] = useState(false);
  const [nativeFromApi, setNativeFromApi] = useState<UsageResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  // The default-login card prefers the quota from the same unified accounts pass; the
  // agent-status feed is only the pre-load fallback.
  const nativeUsage = nativeFromApi ?? agentStatus?.agents?.find(a => a.agent === agentId)?.usage ?? null;

  // `force` = the explicit refresh button: bypasses the backend failure backoff so rows a
  // rate-limited probe pinned at last-good get a real retry. Click-only.
  const refresh = useCallback(async (force = false) => {
    try {
      const r = await api.getAgentAccounts(agentId, force ? { force: true } : { fresh: true });
      if (r.ok) { setAccounts(r.accounts); setActiveId(r.activeAccountId); setMax(r.max); setNativeFromApi(r.nativeUsage ?? null); }
    } catch (e: any) {
      toast(String(e?.message || e), false);
    } finally {
      setLoading(false);
    }
  }, [agentId, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const refreshUsage = useCallback(async () => {
    if (refreshingUsage) return;
    setRefreshingUsage(true);
    try { await refresh(true); } finally { setRefreshingUsage(false); }
  }, [refresh, refreshingUsage]);

  const submitForm = useCallback(async () => {
    if (!form) return;
    setForm(f => (f ? { ...f, saving: true } : f));
    try {
      if (form.mode === 'add') {
        const r = await api.addAgentAccount(agentId, form.label, form.token);
        if (!r.ok) throw new Error(r.error || 'add failed');
        toast(L('账号已添加', 'Account added'));
      } else {
        const r = await api.updateAgentAccount(agentId, form.id!, { token: form.token });
        if (!r.ok) throw new Error(r.error || 'update failed');
        toast(L('Token 已更新', 'Token updated'));
      }
      setForm(null);
      await refresh();
    } catch (e: any) {
      toast(String(e?.message || e), false);
      setForm(f => (f ? { ...f, saving: false } : f));
    }
  }, [agentId, form, refresh, toast]);
