import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { api } from '../../api';
import { useStore } from '../../store';
import type {
  CliCatalogItem,
  McpAuthSpec,
  McpCatalogItem,
  McpCatalogState,
  McpServerConfig,
  SkillCatalogItem,
  SkillInfo,
  RemoteSkillInfo,
} from '../../types';
import { cn } from '../../utils';
import { BrandIcon } from '../../components/BrandIcon';
import { Badge, Button, Input, Modal, ModalHeader, Spinner, SectionLabel, TabsList, TabsTrigger } from '../../components/ui';
import { SettingRowAction, SettingRowCard, SettingRowLead } from '../shared';

function L(locale: string, zh: string, en: string): string {
  return locale === 'zh-CN' ? zh : en;
}

function authKindLabel(locale: string, auth: McpAuthSpec): string {
  if (auth.type === 'mcp-oauth') return L(locale, 'OAuth', 'OAuth');
  if (auth.type === 'credentials') return L(locale, 'API Key', 'API Key');
  return L(locale, '无需配置', 'No auth');
}

const BRAND_PALETTE: Record<string, { hex: string; letter?: string }> = {
  github:           { hex: '#24292f', letter: 'GH' },
  atlassian:        { hex: '#0052cc', letter: 'A' },
  notion:           { hex: '#111827', letter: 'N' },
  linear:           { hex: '#5e6ad2', letter: 'L' },
  sentry:           { hex: '#362d59', letter: 'S' },
  cloudflare:       { hex: '#f6821f', letter: 'CF' },
  gamma:            { hex: '#9f2eff', letter: 'G' },
  huggingface:      { hex: '#ff9d00', letter: 'HF' },
  slack:            { hex: '#4a154b', letter: 'S' },
  lark:             { hex: '#00d6b9', letter: 'L' },
  feishu:           { hex: '#00d6b9', letter: 'F' },
  gmail:            { hex: '#ea4335', letter: 'G' },
  outlook:          { hex: '#0078d4', letter: 'O' },
  stripe:           { hex: '#635bff', letter: 'S' },
  perplexity:       { hex: '#20b8cd', letter: 'P' },
  brave:            { hex: '#fb542b', letter: 'B' },
  filesystem:       { hex: '#64748b', letter: 'FS' },
  fetch:            { hex: '#0ea5e9', letter: 'F' },
  memory:           { hex: '#a855f7', letter: 'M' },
  time:             { hex: '#10b981', letter: 'T' },
  sqlite:           { hex: '#0369a1', letter: 'SQ' },
  postgres:         { hex: '#336791', letter: 'PG' },
};

const DEFAULT_BRAND: { hex: string; letter?: string } = { hex: '#6b7280' };

function brandInfo(slug?: string, fallbackName?: string) {
  const key = (slug || '').toLowerCase();
  const brand = BRAND_PALETTE[key] || DEFAULT_BRAND;
  const letter = brand.letter
    || (fallbackName || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase()
    || '?';
  return { hex: brand.hex, letter };
}

function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const full = m.length === 3
    ? m.split('').map(c => c + c).join('')
    : m.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function useCachedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; refresh: () => Promise<void> } {
  const [data, setData] = useState<T | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetcher();
      if (!mountedRef.current) return;
      setData(next);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {  }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refresh]);

  return { data, loading, refresh };
}

const ExternalLinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ZapIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const CheckCircleIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const PowerIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);

const LockIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const AlertIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);

const UpdateIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const LOCAL_BRAND_SLUGS = new Set([
  'claude', 'codex', 'gemini', 'telegram', 'feishu', 'weixin',
  'playwright', 'vscode', 'cursor', 'windsurf', 'finder',
]);

const ICONIFY_ICONS: Record<string, string> = {
  github:                    'logos:github-icon',
  atlassian:                 'logos:atlassian',
  notion:                    'logos:notion-icon',
  linear:                    'logos:linear-icon',
  sentry:                    'logos:sentry-icon',
  cloudflare:                'logos:cloudflare-icon',
  'cloudflare-docs':         'logos:cloudflare-icon',
  'cloudflare-bindings':     'logos:cloudflare-icon',
  'cloudflare-observability':'logos:cloudflare-icon',
  slack:                     'logos:slack-icon',
  lark:                      'icon-park:lark',
  feishu:                    'icon-park:lark',
  gmail:                     'logos:google-gmail',
  outlook:                   'vscode-icons:file-type-outlook',
  stripe:                    'logos:stripe',
  perplexity:                'logos:perplexity-icon',
  brave:                     'logos:brave',
  'brave-search':            'logos:brave',
  huggingface:               'logos:hugging-face-icon',
  postgres:                  'logos:postgresql',
  postgresql:                'logos:postgresql',
  sqlite:                    'logos:sqlite',
  vercel:                    'logos:vercel-icon',
  netlify:                   'logos:netlify-icon',
  supabase:                  'logos:supabase-icon',
  heroku:                    'logos:heroku-icon',
  docker:                    'logos:docker-icon',
  pnpm:                      'logos:pnpm',
  aws:                       'logos:aws',
  'google-cloud':            'logos:google-cloud',
  googlecloud:               'logos:google-cloud',
  amazonwebservices:         'logos:aws',
};

const WORDMARK_ICONS = new Set(['stripe']);

function resolveBrandLogoUrl(iconSlug?: string, iconUrl?: string): string | undefined {
  if (iconUrl) return iconUrl;
  if (!iconSlug) return undefined;
  if (LOCAL_BRAND_SLUGS.has(iconSlug)) return undefined;
  const iconId = ICONIFY_ICONS[iconSlug];
  if (!iconId) return undefined;
  return `https://api.iconify.design/${iconId}.svg`;
}

function BrandAvatar({
  iconSlug,
  iconUrl,
  name,
  size = 32,
  className,
}: { iconSlug?: string; iconUrl?: string; name: string; size?: number; className?: string }) {
  const { hex, letter } = brandInfo(iconSlug, name);
  const [imgFailed, setImgFailed] = useState(false);
  const remoteUrl = resolveBrandLogoUrl(iconSlug, iconUrl);
  const useLocalBrand = iconSlug && LOCAL_BRAND_SLUGS.has(iconSlug);
  const useRemote = !!remoteUrl && !imgFailed;
  const useRealLogo = useLocalBrand || useRemote;
  const isWordmark = !!iconSlug && WORDMARK_ICONS.has(iconSlug);
  const logoSize = Math.round(size * (isWordmark ? 0.92 : 0.76));

  if (useRealLogo) {
    return (
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white',
          className,
        )}
        style={{
          width: size,
          height: size,
          boxShadow: `0 0 0 1px ${withAlpha(hex, 0.18)}, 0 4px 12px ${withAlpha(hex, 0.14)}`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${withAlpha(hex, 0.06)} 0%, transparent 70%)` }}
        />
        {useLocalBrand ? (
          <BrandIcon brand={iconSlug!} size={logoSize} />
        ) : (
          <img
            src={remoteUrl}
            alt=""
            width={logoSize}
            height={logoSize}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="relative"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-semibold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${withAlpha(hex, 1)} 0%, ${withAlpha(hex, 0.82)} 100%)`,
        boxShadow: `0 1px 0 rgba(255,255,255,0.08) inset, 0 6px 14px ${withAlpha(hex, 0.28)}`,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        letterSpacing: letter.length > 1 ? '-0.02em' : 0,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.22), transparent 55%)' }}
      />
      <span className="relative">{letter}</span>
    </div>
  );
}

function StatePill({ state, locale }: { state: McpCatalogState; locale: string }) {
  if (state === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--th-ok)]"
            style={{ background: 'color-mix(in oklab, var(--th-ok) 12%, transparent)' }}>
        <CheckCircleIcon size={10} />{L(locale, '已连接', 'Connected')}
      </span>
    );
  }
  if (state === 'disabled') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-edge bg-inset/60 px-2 py-0.5 text-[10px] font-medium text-fg-5">
        <PowerIcon size={10} />{L(locale, '已停用', 'Paused')}
      </span>
    );
  }
  if (state === 'needs_auth') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--th-warn)]"
            style={{ background: 'color-mix(in oklab, var(--th-warn) 12%, transparent)' }}>
        <LockIcon size={10} />{L(locale, '待授权', 'Needs auth')}
      </span>
    );
  }
  if (state === 'unhealthy') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--th-err)]"
            style={{ background: 'color-mix(in oklab, var(--th-err) 12%, transparent)' }}>
        <AlertIcon size={10} />{L(locale, '异常', 'Unhealthy')}
      </span>
    );
  }
  return null;
}

function CredentialsDialog({
  open, onClose, locale, item, initial, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
  item: McpCatalogItem | null;
  initial?: Record<string, string>;
  onSubmit: (credentials: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && item && item.auth.type === 'credentials') {
      const seed: Record<string, string> = {};
      for (const f of item.auth.fields) seed[f.key] = initial?.[f.key] || '';
      setValues(seed);
    }
  }, [open, item, initial]);

  if (!item || item.auth.type !== 'credentials') return null;
  const missingRequired = item.auth.fields.some(f => f.required && !(values[f.key] || '').trim());

  const submit = async () => {
    setSubmitting(true);
    try { await onSubmit(values); } finally { setSubmitting(false); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader
        title={L(locale, `配置 ${item.name}`, `Configure ${item.name}`)}
        description={locale === 'zh-CN' ? item.descriptionZh : item.description}
        onClose={onClose}
      />
      <div className="space-y-3">
        {item.auth.fields.map(field => (
          <div key={field.key}>
            <label className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">
                {locale === 'zh-CN' ? field.labelZh : field.label}
                {field.required && <span className="ml-1 text-err">*</span>}
              </span>
              {field.helpUrl && (
                <a href={field.helpUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80">
                  {L(locale, '获取', 'Get one')} <ExternalLinkIcon />
                </a>
              )}
            </label>
            <Input
              value={values[field.key] || ''}
              onChange={e => setValues({ ...values, [field.key]: e.target.value })}
              type={field.secret ? 'password' : 'text'}
              placeholder={field.placeholder}
              className="font-mono text-[12px]"
            />
          </div>
        ))}
        <div className="flex justify-end gap-2 border-t border-edge pt-3">
          <Button variant="ghost" onClick={onClose}>{L(locale, '取消', 'Cancel')}</Button>
          <Button variant="primary" disabled={submitting || missingRequired} onClick={submit}>
            {submitting ? <Spinner /> : L(locale, '保存并启用', 'Save & Enable')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CustomMcpDialog({
  open, onClose, locale, scope, workdir, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
  scope: 'global' | 'workspace';
  workdir?: string;
  onAdded: () => void;
}) {
  const toast = useStore(s => s.toast);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio');
  const [command, setCommand] = useState('npx');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState<Array<{ k: string; v: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(''); setTransport('stdio'); setCommand('npx'); setArgs(''); setUrl(''); setEnv([]);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const envObj: Record<string, string> = {};
      for (const { k, v } of env) if (k.trim()) envObj[k.trim()] = v;
      const config: McpServerConfig = transport === 'http'
        ? { type: 'http', url: url.trim(), enabled: true, ...(Object.keys(envObj).length ? { headers: envObj } : {}) }
        : {
            type: 'stdio',
            command: command.trim(),
            args: args.trim() ? args.trim().split(/\s+/) : [],
            enabled: true,
            ...(Object.keys(envObj).length ? { env: envObj } : {}),
          };
      await api.addCustomMcp(name.trim(), config, scope, workdir);
      toast(L(locale, `${name} 已添加`, `${name} added`), true);
      onAdded();
      onClose();
    } catch (e: any) {
      toast(e?.message || 'Failed', false);
    } finally { setSubmitting(false); }
  };

  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader
        title={L(locale, '添加自定义 MCP 服务', 'Add Custom MCP Server')}
        description={L(locale, '不在推荐列表中的自定义服务。', 'For servers not in the recommended catalog.')}
        onClose={onClose}
      />
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">{L(locale, '名称', 'Name')}</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="my-server" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">{L(locale, '传输', 'Transport')}</label>
            <div className="flex gap-1.5">
              {(['stdio', 'http'] as const).map(t => (
                <button key={t}
                  onClick={() => setTransport(t)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
                    transport === t ? 'border-primary/40 bg-primary/10 text-primary' : 'border-edge bg-inset/50 text-fg-4 hover:bg-inset',
                  )}
                >{t}</button>
              ))}
            </div>
          </div>
        </div>
        {transport === 'stdio' ? (
          <>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">{L(locale, '命令', 'Command')}</label>
              <Input value={command} onChange={e => setCommand(e.target.value)} className="font-mono" placeholder="npx" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">{L(locale, '参数', 'Arguments')}</label>
              <Input value={args} onChange={e => setArgs(e.target.value)} className="font-mono" placeholder="-y @example/server" />
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">URL</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} className="font-mono" placeholder="https://example.com/mcp" />
          </div>
        )}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">
              {transport === 'http' ? L(locale, 'Headers', 'Headers') : L(locale, '环境变量', 'Env')}
            </span>
            <button className="text-[11px] font-medium text-primary hover:text-primary/80" onClick={() => setEnv([...env, { k: '', v: '' }])}>
              + {L(locale, '添加', 'Add')}
            </button>
          </div>
          {env.length > 0 && (
            <div className="space-y-1 rounded-md border border-edge bg-inset/40 p-2">
              {env.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input className="w-2/5 !h-7 !text-[12px] font-mono" value={row.k}
                    onChange={e => { const n = [...env]; n[i] = { ...n[i], k: e.target.value }; setEnv(n); }} placeholder="KEY" />
                  <Input className="flex-1 !h-7 !text-[12px] font-mono" value={row.v}
                    onChange={e => { const n = [...env]; n[i] = { ...n[i], v: e.target.value }; setEnv(n); }}
                    type={/token|secret|key|bearer/i.test(row.k) ? 'password' : 'text'} placeholder="value" />
                  <button className="shrink-0 rounded p-1 text-fg-5 hover:text-err" onClick={() => setEnv(env.filter((_, j) => j !== i))}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-edge pt-3">
          <Button variant="ghost" onClick={onClose}>{L(locale, '取消', 'Cancel')}</Button>
          <Button variant="primary" disabled={!name.trim() || submitting} onClick={submit}>
            {submitting ? <Spinner /> : L(locale, '添加', 'Add')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CustomSkillDialog({
  open, onClose, locale, scope, workdir, onInstalled,
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
  scope: 'global' | 'workspace';
  workdir?: string;
  onInstalled: () => void;
}) {
  const toast = useStore(s => s.toast);
  const [source, setSource] = useState('');
  const [skillName, setSkillName] = useState('');
  const [installing, setInstalling] = useState(false);

  useEffect(() => { if (open) { setSource(''); setSkillName(''); } }, [open]);

  const submit = async () => {
    if (!source.trim()) return;
    setInstalling(true);
    try {
      const r = await api.installSkill(source.trim(), scope === 'global', skillName.trim() || undefined, workdir);
      if (r.ok) {
        toast(L(locale, '技能安装成功', 'Skill installed'), true);
        onInstalled();
        onClose();
      } else toast(r.error || 'Failed', false);
    } catch (e: any) {
      toast(e?.message || 'Failed', false);
    } finally { setInstalling(false); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader
        title={L(locale, '安装自定义技能', 'Install Custom Skill')}
        description={L(locale, '通过 npx skills add 从 GitHub 仓库安装。', 'Installs via npx skills add from a GitHub repo.')}
        onClose={onClose}
      />
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">{L(locale, 'GitHub 来源', 'GitHub Source')}</label>
          <Input value={source} onChange={e => setSource(e.target.value)} placeholder="owner/repo" className="font-mono" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">{L(locale, '指定技能（可选）', 'Specific skill (optional)')}</label>
          <Input value={skillName} onChange={e => setSkillName(e.target.value)} placeholder={L(locale, '留空安装全部', 'Leave empty for all')} />
        </div>
        <div className="flex justify-end gap-2 border-t border-edge pt-3">
          <Button variant="ghost" onClick={onClose}>{L(locale, '取消', 'Cancel')}</Button>
          <Button variant="primary" disabled={!source.trim() || installing} onClick={submit}>
            {installing ? <Spinner /> : L(locale, '安装', 'Install')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function openOAuthPopup(authUrl: string, expectedState: string): Promise<boolean> {
  return new Promise((resolve) => {
    const popup = window.open(authUrl, 'swarmdeck_mcp_oauth', 'width=640,height=780,noopener=no');
    if (!popup) { resolve(false); return; }

    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearInterval(watcher);
      resolve(ok);
    };

    const onMessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.type !== 'mcp-oauth') return;
      if (expectedState && data.state !== expectedState) return;
      finish(!!data.ok);
      try { popup.close(); } catch {}
    };
    window.addEventListener('message', onMessage);

    const watcher = setInterval(() => {
      if (popup.closed) finish(false);
    }, 500);
  });
}

function ConnectedCard({
  item, locale, busy, index,
  onPrimary, onRemove, onReauth, onReconfigure,
}: {
  item: McpCatalogItem;
  locale: string;
  busy: boolean;
  index: number;
  onPrimary: () => void;
  onRemove?: () => void;
  onReauth?: () => void;
  onReconfigure?: () => void;
}) {
  const primaryLabel = (() => {
    switch (item.state) {
      case 'ready': return L(locale, '停用', 'Pause');
      case 'unhealthy': return L(locale, '停用', 'Pause');
      case 'disabled': return L(locale, '启用', 'Enable');
      case 'needs_auth':
        return item.auth.type === 'mcp-oauth' ? L(locale, '授权', 'Authorize') : L(locale, '配置', 'Configure');
      default: return L(locale, '启用', 'Enable');
    }
  })();

  const cardStyle: CSSProperties = {
    animationDelay: `${Math.min(index, 8) * 40}ms`,
  };

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-2)] p-4',
        'transition-[background,border-color] duration-200',
        'hover:border-[var(--edge-default)] hover:bg-[var(--surface-3)]',
        'animate-in-up',
      )}
      style={cardStyle}
    >
      <div className="relative flex items-start gap-3">
        <BrandAvatar iconSlug={item.iconSlug} iconUrl={item.iconUrl} name={item.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[14px] font-semibold text-fg">{item.name}</div>
            {item.homepage && (
              <a href={item.homepage} target="_blank" rel="noreferrer"
                 className="text-fg-5 hover:text-fg-3 transition-colors">
                <ExternalLinkIcon />
              </a>
            )}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-4">
            {locale === 'zh-CN' ? item.descriptionZh : item.description}
          </div>
        </div>
        <StatePill state={item.state} locale={locale} />
      </div>

      <div className="relative mt-3 flex items-center justify-between border-t border-[var(--edge-subtle)] pt-3">
        <span className="inline-flex items-center gap-1 text-[11px] text-fg-5">
          <span className="h-1.5 w-1.5 rounded-full bg-fg-6" />
          {authKindLabel(locale, item.auth)}
        </span>
        <div className="flex items-center gap-1">
          {item.installed && item.state !== 'needs_auth' && onReauth && (
            <Button variant="ghost" size="sm" onClick={onReauth} disabled={busy}>
              {L(locale, '重新授权', 'Re-auth')}
            </Button>
          )}
          {item.installed && item.state !== 'needs_auth' && onReconfigure && (
            <Button variant="ghost" size="sm" onClick={onReconfigure} disabled={busy}>
              {L(locale, '编辑', 'Edit')}
            </Button>
          )}
          <Button
            variant={item.state === 'disabled' || item.state === 'needs_auth' ? 'primary' : 'ghost'}
            size="sm"
            onClick={onPrimary}
            disabled={busy}
          >
            {busy ? <Spinner /> : primaryLabel}
          </Button>
          {item.installed && onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy} className="hover:!text-err">
              {L(locale, '移除', 'Remove')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AvailableCard({
  item, locale, busy, index, onPrimary,
}: {
  item: McpCatalogItem;
  locale: string;
  busy: boolean;
  index: number;
  onPrimary: () => void;
}) {
  const primaryLabel = item.auth.type === 'none'
    ? L(locale, '一键启用', 'One-click enable')
    : L(locale, '授权并启用', 'Authorize & enable');

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-2)] p-4',
        'transition-[background,border-color] duration-200',
        'hover:border-[var(--edge-default)] hover:bg-[var(--surface-3)]',
        'animate-in-up',
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <div className="flex items-start gap-3">
        <BrandAvatar iconSlug={item.iconSlug} iconUrl={item.iconUrl} name={item.name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[13.5px] font-semibold text-fg">{item.name}</div>
            {item.homepage && (
              <a href={item.homepage} target="_blank" rel="noreferrer"
                 className="text-fg-5 hover:text-fg-3 transition-colors">
                <ExternalLinkIcon />
              </a>
            )}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-4">
            {locale === 'zh-CN' ? item.descriptionZh : item.description}
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[11px] text-fg-5">
          {authKindLabel(locale, item.auth)}
        </span>
        <Button variant="outline" size="sm" onClick={onPrimary} disabled={busy}
                className="group-hover:border-edge-h">
          {busy ? <Spinner /> : primaryLabel}
        </Button>
      </div>
    </div>
  );
}

function skillCountSummary(item: SkillCatalogItem, locale: string): string {
  const installed = item.installedNames.length;
  if (typeof item.totalCount === 'number') {
    const totalStr = item.partial ? `${item.totalCount}+` : String(item.totalCount);
    return locale === 'zh-CN'
      ? `${installed} / ${totalStr} 已安装`
      : `${installed} / ${totalStr} installed`;
  }
  return installed > 0
    ? (locale === 'zh-CN' ? `${installed} 已安装` : `${installed} installed`)
    : L(locale, '未安装', 'Not installed');
}

