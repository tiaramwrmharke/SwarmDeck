import type { ChannelSetupState } from './types';

type Translate = (key: string) => string;

export function isChannelValidationPending(channel: ChannelSetupState | null | undefined): boolean {
  return !!channel?.configured && (!channel.validated || channel.status === 'checking');
}

export function hasPendingChannelValidation(channels: ChannelSetupState[] | null | undefined): boolean {
  return Array.isArray(channels) && channels.some(channel => isChannelValidationPending(channel));
}

export function channelSummaryText(channel: ChannelSetupState | null | undefined, t: Translate): string {
  if (!channel || !channel.configured) return t('status.needsConfig');
  if (channel.detail) return channel.detail;
