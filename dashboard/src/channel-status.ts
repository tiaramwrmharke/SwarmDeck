import type { ChannelSetupState } from './types';

type Translate = (key: string) => string;

export function isChannelValidationPending(channel: ChannelSetupState | null | undefined): boolean {
  return !!channel?.configured && (!channel.validated || channel.status === 'checking');
}

export function hasPendingChannelValidation(channels: ChannelSetupState[] | null | undefined): boolean {
  return Array.isArray(channels) && channels.some(channel => isChannelValidationPending(channel));
}
