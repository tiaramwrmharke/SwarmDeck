import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { createT } from '../i18n';
import { Modal, ModalHeader, Button, Input } from './ui';
import { cn } from '../utils';
import { getEndpoint, setEndpoint, clearEndpoint, encodeCode, decodeCode, type ConnMode } from '../endpoint';

interface PairInfo { token?: string; nodeId?: string; rendezvous?: string | null; publicHost?: string | null; registered?: boolean }

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-semibold tracking-tight text-fg">{title}</div>
      <div className="mt-0.5 text-[12px] leading-relaxed text-fg-5">{subtitle}</div>
    </div>
  );
}

export function ClientConnectionPanel({ active = true }: { active?: boolean }) {
  const locale = useStore(s => s.locale);
  const toast = useStore(s => s.toast);
  const t = useMemo(() => createT(locale), [locale]);

  const ep = getEndpoint();
  const [mode, setMode] = useState<ConnMode>(ep ? ep.mode : 'local');
  const [host, setHost] = useState(ep?.host || '');
  const [token, setToken] = useState(ep?.token || '');
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!active) return;
    const e = getEndpoint();
    setMode(e ? e.mode : 'local'); setHost(e?.host || ''); setToken(e?.token || ''); setCode('');
  }, [active]);

  const connect = () => {
    if (mode === 'local') { clearEndpoint(); }
    else if (mode === 'direct') {
      if (!host.trim()) { toast(t('conn.needHost'), false); return; }
      setEndpoint({ host: host.trim(), token: token.trim() || undefined });
    } else {
      const d = decodeCode(code.trim());
      if (!d) { toast(t('conn.badCode'), false); return; }
      setEndpoint(d);
    }
    window.location.reload();
  };

  const MODES: Array<{ key: ConnMode; label: string; hint: string }> = [
    { key: 'local', label: t('conn.local'), hint: t('conn.localHint') },
