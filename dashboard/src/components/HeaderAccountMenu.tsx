import { useEffect, useRef, useState } from 'react';
import { api, type AgentAccountsResponse } from '../api';
import type { UsageResult } from '../types';
import { useStore } from '../store';
import { getAgentMeta } from '../utils';
import { formatCapturedAt, usageGauge, usageWindowTone, type UsageGauge } from '../usage';
import { BrandIcon } from './BrandIcon';
import { Tooltip } from './ui';
import { UsageRing } from './UsageRing';
import { UsageBars } from './UsageBars';
import { UsageTooltipContent } from './UsageTooltip';

// Top-bar usage + account control for an account-capable agent (claude). With NO local accounts
// it is identical to the read-only usage ring every other agent uses (hover → detail). Once
// accounts exist, hovering opens an INTERACTIVE popover (same width/style as that tooltip) that
// lists every account with its usage and lets you switch — no click needed to open.
export function HeaderAccountMenu({ agent, nativeGauge, nativeUsage, t }: {
  agent: string;
  nativeGauge: UsageGauge | null;
  nativeUsage: UsageResult | null;
  t: (key: string) => string;
}) {
  const locale = useStore(s => s.locale);
  const toast = useStore(s => s.toast);
  const refreshAgentStatus = useStore(s => s.refreshAgentStatus);
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AgentAccountsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  // `fresh` = the user is actively looking (popover open / just switched): the backend re-probes
  // past its short fresh window. Debounce lives server-side, so firing on every hover is safe.
  const load = async (fresh = false) => { try { const r = await api.getAgentAccounts(agent, { fresh }); if (r.ok) setData(r); } catch { /* ignore */ } };
  // The top-bar ring is driven by this snapshot, not the polled agent-status store, so it needs
  // its own cadence or it freezes at the mount value. Probe fresh on open, every 5 min while the
  // tab is visible, and whenever the tab regains focus — server-side debounce keeps this cheap.
  useEffect(() => {
    void load(true);
    const id = window.setInterval(() => { if (!document.hidden) void load(true); }, 5 * 60_000);
    const onVisibility = () => { if (!document.hidden) void load(true); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [agent]);
