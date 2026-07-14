export interface BotInfo { id: number | string; username: string; displayName: string }

export interface MenuCommand {
  command: string;
  description: string;
}

export interface ChannelCapabilities {
  editMessages: boolean;
  typingIndicators: boolean;
  commandMenu: boolean;
  messageReactions: boolean;
  sendImage: boolean;
}

export const DEFAULT_CHANNEL_CAPABILITIES: ChannelCapabilities = Object.freeze({
  editMessages: false,
  typingIndicators: false,
  commandMenu: false,
  messageReactions: false,
  sendImage: false,
});

export type ChannelCapability = keyof ChannelCapabilities;

