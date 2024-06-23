import { useMemo } from 'react';
import { isChannelValidationPending } from '../../channel-status';
import { type Locale } from '../../i18n';
import { useStore } from '../../store';
import { BrandIcon } from '../../components/BrandIcon';
import type { ChannelSetupState, UserConfig } from '../../types';
import { Button, Row, RowGroup, Spinner, StatusPill, type StatusState } from '../../components/ui';

type IMAccessTabProps = {
  onOpenWeixin: () => void;
  onOpenTelegram: () => void;
  onOpenFeishu: () => void;
  onOpenSlack: () => void;
  onOpenDiscord: () => void;
  onOpenDingtalk: () => void;
  onOpenWeCom: () => void;
};

type ChannelKey = 'weixin' | 'telegram' | 'feishu' | 'slack' | 'discord' | 'dingtalk' | 'wecom';

type ChannelRowMeta = {
  key: ChannelKey;
  title: string;
  subtitle: string;
  channel: ChannelSetupState | null;
  loading?: boolean;
  statusLabel: string;
  statusVariant: 'ok' | 'warn' | 'muted' | 'accent';
  statusDescription: string;
  summary: string;
  summaryLabel: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
};

type CopyPack = {
  status: string;
  summary: string;
  loading: string;
  chats: string;
  notConnected: string;
  configuring: string;
  connected: string;
  failed: string;
  configure: string;
  continueSetup: string;
  viewSettings: string;
  noWeixin: string;
  noTelegram: string;
  noFeishu: string;
  noSlack: string;
  noDiscord: string;
  noDingtalk: string;
  noWeCom: string;
  pendingValidation: string;
  connectedReady: string;
  validationFailed: string;
  accountLinked: string;
  tokenSaved: string;
  appCredentialsSaved: string;
  allowedChats: string;
  notConnectedDetail: string;
};

function getCopy(locale: Locale): CopyPack {
  if (locale === 'zh-CN') {
    return {
      status: '状态',
