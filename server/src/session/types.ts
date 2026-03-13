export type Phase = 'DAY_OPEN' | 'DAY_VOTE' | 'DAY_RESOLVE' | 'NIGHT_ACTIONS' | 'NIGHT_RESOLVE' | 'NIGHT_REVEAL';
export type ChannelType = 'GLOBAL' | 'PRIVATE' | 'ROLE' | 'TEMP' | 'SYSTEM';
export type IntentType = 'JOIN_SESSION' | 'SEND_MESSAGE' | 'SWITCH_CHANNEL';

export interface PlayerState {
  id: string;
  name: string;
  online: boolean;
  socketId?: string;
  reconnectToken: string;
  activeChannelId: string;
}

export interface ChannelState {
  id: string;
  label: string;
  type: ChannelType;
  members: string[];
  locked: boolean;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface SystemEvent {
  id: string;
  type: string;
  summary: string;
  timestamp: number;
}

export interface SessionState {
  id: string;
  phase: Phase;
  players: Map<string, PlayerState>;
  channels: Map<string, ChannelState>;
  messagesByChannel: Map<string, ChatMessage[]>;
  systemEvents: SystemEvent[];
}

export interface PlayerIntent<TPayload = Record<string, unknown>> {
  type: IntentType;
  timestamp: number;
  payload: TPayload & {
    sessionId?: string;
    playerId?: string;
  };
}

export interface JoinPayload {
  sessionId: string;
  username: string;
  reconnectToken?: string;
}

export interface SendMessagePayload {
  sessionId: string;
  playerId: string;
  channelId: string;
  text: string;
}

export interface SwitchChannelPayload {
  sessionId: string;
  playerId: string;
  channelId?: string;
  targetUsername?: string;
}
