import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { createT } from '../i18n';
import { api } from '../api';
import { Modal, ModalHeader, Button, Input, Label, Badge } from './ui';
import { fmtTime, getAgentMeta, sessionDisplayDetail, sessionDisplayState } from '../utils';
import { DirBrowser } from './DirBrowser';
import type { BrowserStatusResponse, SessionInfo, SessionTailMessage, DirEntry } from '../types';

const DEFAULT_WEIXIN_BASE_URL = 'https://ilinkai.weixin.qq.com';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError'
    || /aborted/i.test(error.message)
  );
}

function requestErrorText(error: unknown, t: (key: string) => string): string {
  if (error instanceof Error && /timed out/i.test(error.message)) return t('modal.requestTimeout');
  return t('modal.networkError');
}

export function TelegramModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useStore(s => s.state);
  const toast = useStore(s => s.toast);
  const reloadUntil = useStore(s => s.reloadUntil);
  const locale = useStore(s => s.locale);
  const t = useMemo(() => createT(locale), [locale]);
  const [token, setToken] = useState('');
  const [ids, setIds] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (open) {
      setToken(stateRef.current?.config.telegramBotToken || '');
      setIds(stateRef.current?.config.telegramAllowedChatIds || '');
      setShowToken(false);
      setResult(null);
      setGuideOpen(!stateRef.current?.config.telegramBotToken);
    } else {
      requestRef.current?.abort();
      requestRef.current = null;
      setSaving(false);
    }
  }, [open]);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const handleSave = async () => {
    if (!token.trim()) { toast(t('modal.inputToken'), false); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSaving(true);
    setResult(null);
    let shouldClose = false;
    try {
      const r = await api.validateTelegramConfig(token.trim(), ids.trim(), {
        signal: controller.signal,
        timeoutMs: 12_000,
      });
      if (!r.ok) {
        setResult({ ok: false, text: '\u2717 ' + (r.error || t('modal.validationFailed')) });
        return;
      }
      const normalizedIds = r.normalizedAllowedChatIds ?? ids.trim();
      setResult({ ok: true, text: '\u2713 @' + (r.bot?.username || 'bot') + (r.bot?.displayName ? ' (' + r.bot.displayName + ')' : '') });
      const channels = new Set<string>(
        (state?.setupState?.channels || [])
          .filter(item => (item.ready || item.configured) && item.channel !== 'telegram')
          .map(item => item.channel),
      );
      channels.add('telegram');
      await api.saveConfig({
        telegramBotToken: token.trim(),
        telegramAllowedChatIds: normalizedIds,
        channels: [...channels],
      });
      const refreshed = await reloadUntil(nextState => {
        const channel = nextState.setupState?.channels?.find(item => item.channel === 'telegram');
        return nextState.config.telegramBotToken === token.trim()
          && (nextState.config.telegramAllowedChatIds || '') === normalizedIds
          && !!channel?.ready;
      }, { attempts: 10, intervalMs: 350 });
      if (!refreshed) {
        setResult({ ok: false, text: '\u2717 ' + t('modal.refreshStateFailed') });
        toast(t('modal.refreshStateFailed'), false);
        return;
      }
      toast(t('modal.tgSaved'));
      shouldClose = true;
    } catch (err) {
      if (isAbortError(err)) return;
      const text = requestErrorText(err, t);
      setResult({ ok: false, text: '\u2717 ' + text });
      toast(text, false);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setSaving(false);
      if (shouldClose) onClose();
    }
  };

  const handleRequestClose = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    onClose();
  };

  return (
    <Modal open={open} onClose={handleRequestClose}>
      <ModalHeader title={t('modal.configureTelegram')} onClose={handleRequestClose} />
      <div className="space-y-4">
        <div className="rounded-lg border border-edge bg-panel-alt">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-fg-3 hover:text-fg-2 transition-colors"
            onClick={() => setGuideOpen(!guideOpen)}
          >
            <span>{t('modal.tgGuideTitle')}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${guideOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {guideOpen && (
            <div className="space-y-1 border-t border-edge px-3 pb-3 pt-2 text-xs leading-relaxed text-fg-4">
              <p>{t('modal.tgGuideStep1')}</p>
              <p>{t('modal.tgGuideStep2')}</p>
              <p>{t('modal.tgGuideStep3')}</p>
              <p>{t('modal.tgGuideStep4')}</p>
              <p className="mt-2 text-[11px] text-fg-5">{t('modal.tgGuideIdTip')}</p>
            </div>
          )}
        </div>

        <div>
          <Label>{t('modal.botToken')}</Label>
          <div className="flex gap-2">
            <Input
              type={showToken ? 'text' : 'password'}
              className="flex-1 font-mono text-xs"
              placeholder={t('modal.pasteToken')}
              value={token}
              onChange={e => setToken(e.target.value)}
            />
            <Button variant="ghost" size="sm" className="!w-[34px] !p-0" onClick={() => setShowToken(!showToken)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </Button>
          </div>
        </div>
        {result && (
          <div className="text-xs" style={{ color: result.ok ? 'var(--th-ok)' : 'var(--th-err)' }}>
            {result.text}
          </div>
        )}
        <div>
          <Label>{t('modal.allowedIds')} <span className="text-fg-5">({t('modal.optional')})</span></Label>
          <Input className="font-mono text-xs" placeholder={t('modal.commaSep')} value={ids} onChange={e => setIds(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={handleRequestClose}>{t('modal.cancel')}</Button>
        <Button variant="primary" disabled={saving} onClick={handleSave}>{saving ? t('modal.validating') : t('modal.validateSave')}</Button>
      </div>
    </Modal>
  );
}

const FEISHU_PERMS_JSON = JSON.stringify(
  {
    scopes: {
      tenant: [
        'im:message',
        'im:message:send_as_bot',
        'im:message.p2p_msg:readonly',
        'im:message.group_at_msg:readonly',
        'im:resource',
      ],
      user: [],
    },
  },
  null,
  2,
);

export function FeishuModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useStore(s => s.state);
  const toast = useStore(s => s.toast);
  const reloadUntil = useStore(s => s.reloadUntil);
  const locale = useStore(s => s.locale);
  const t = useMemo(() => createT(locale), [locale]);
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (open) {
      setAppId(stateRef.current?.config.feishuAppId || '');
      setSecret(stateRef.current?.config.feishuAppSecret || '');
      setResult(null);
      setGuideOpen(!stateRef.current?.config.feishuAppId);
    } else {
      requestRef.current?.abort();
      requestRef.current = null;
      setSaving(false);
    }
  }, [open]);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const handleSave = async () => {
    if (!appId.trim()) { toast(t('modal.inputAppId'), false); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSaving(true);
    setResult(null);
    let shouldClose = false;
    try {
      const validated = await api.validateFeishuConfig(appId.trim(), secret.trim(), {
        signal: controller.signal,
        timeoutMs: 20_000,
      });
      if (!validated.ok) {
        setResult({ ok: false, text: '\u2717 ' + (validated.error || t('modal.validationFailed')) });
        return;
      }
      setResult({ ok: true, text: '\u2713 ' + (validated.app?.displayName || validated.app?.appId || appId.trim()) });
      const channels = new Set<string>(
        (state?.setupState?.channels || [])
          .filter(item => (item.ready || item.configured) && item.channel !== 'feishu')
          .map(item => item.channel),
      );
      channels.add('feishu');
      await api.saveConfig({
        feishuAppId: appId.trim(),
        feishuAppSecret: secret.trim(),
        channels: [...channels],
      });
      const refreshed = await reloadUntil(nextState => {
        const channel = nextState.setupState?.channels?.find(item => item.channel === 'feishu');
        return nextState.config.feishuAppId === appId.trim()
          && nextState.config.feishuAppSecret === secret.trim()
          && !!channel?.ready;
      }, { attempts: 10, intervalMs: 350 });
      if (!refreshed) {
        setResult({ ok: false, text: '\u2717 ' + t('modal.refreshStateFailed') });
        toast(t('modal.refreshStateFailed'), false);
        return;
      }
      toast(t('modal.feishuSaved'));
      shouldClose = true;
    } catch (err) {
      if (isAbortError(err)) return;
      const text = requestErrorText(err, t);
      setResult({ ok: false, text: '\u2717 ' + text });
      toast(text, false);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setSaving(false);
      if (shouldClose) onClose();
    }
  };

  const handleRequestClose = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    onClose();
  };

  return (
    <Modal open={open} onClose={handleRequestClose}>
      <ModalHeader title={t('modal.configureFeishu')} onClose={handleRequestClose} />
      <div className="space-y-4">
        <div className="rounded-lg border border-edge bg-panel-alt">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-fg-3 hover:text-fg-2 transition-colors"
            onClick={() => setGuideOpen(!guideOpen)}
          >
            <span>{t('modal.feishuGuideTitle')}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${guideOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {guideOpen && (
            <div className="space-y-1 border-t border-edge px-3 pb-3 pt-2 text-xs leading-relaxed text-fg-4">
              <p>{t('modal.feishuGuideStep1')}</p>
              <p>{t('modal.feishuGuideStep2')}</p>
              <p>{t('modal.feishuGuideStep3')}</p>
              <p>{t('modal.feishuGuideStep4')}</p>
              <div className="ml-3 mt-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-fg-5">{t('modal.feishuGuidePerms')}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(FEISHU_PERMS_JSON);
                      toast(t('modal.feishuJsonCopied'));
                    }}
                  >
                    {t('modal.feishuCopyJson')}
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-md border border-edge bg-inset p-2 font-mono text-[11px] leading-snug text-fg-3">{FEISHU_PERMS_JSON}</pre>
                <p className="mt-1 text-[11px] text-fg-5">{t('modal.feishuJsonNote')}</p>
              </div>
              <p>{t('modal.feishuGuideStep5')}</p>
              <p>{t('modal.feishuGuideStep6')}</p>
              <p>{t('modal.feishuGuideStep7')}</p>
              <p className="mt-2 text-[11px] text-fg-5">{t('modal.feishuGuideCardKitTip')}</p>
            </div>
          )}
        </div>

        <div>
          <Label>{t('modal.appId')}</Label>
          <Input className="font-mono text-xs" placeholder={t('modal.feishuPlaceholder')} value={appId} onChange={e => setAppId(e.target.value)} />
        </div>
        <div>
          <Label>{t('modal.appSecret')}</Label>
          <Input type="password" className="font-mono text-xs" placeholder={t('modal.appSecret')} value={secret} onChange={e => setSecret(e.target.value)} />
        </div>
        {result && (
          <div className="text-xs" style={{ color: result.ok ? 'var(--th-ok)' : 'var(--th-err)' }}>
            {result.text}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={handleRequestClose}>{t('modal.cancel')}</Button>
        <Button variant="primary" disabled={saving} onClick={handleSave}>{saving ? t('modal.validating') : t('modal.validateSave')}</Button>
      </div>
    </Modal>
  );
}
