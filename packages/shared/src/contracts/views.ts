import type {
  ChannelType,
  IntentType,
  LobbyStatus,
  Phase,
  SessionStatus,
  SystemEventType,
} from '../enums.js';

export interface LobbySettingsView {
  minPlayers: number;
  maxPlayers: number;
  dayDurationSeconds: number;
  nightDurationSeconds: number;
}

export interface LobbyPlayerView {
  playerId: string;
  displayName: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  alive: boolean;
}

export interface LobbyView {
  code: string;
  status: LobbyStatus;
  hostPlayerId: string;
  players: LobbyPlayerView[];
  settings: LobbySettingsView;
  sessionId: string | null;
}

export interface SessionPlayerView {
  playerId: string;
  displayName: string;
  alive: boolean;
  connected: boolean;
}

export interface ChannelView {
  id: string;
  type: ChannelType;
  members: string[];
  locked: boolean;
  expiresAt: Phase | null;
}

export interface SystemEventView {
  id: string;
  type: SystemEventType;
  createdAt: string;
}

export interface SessionView {
  gameId: string;
  lobbyCode: string;
  status: SessionStatus;
  phase: Phase;
  cycle: number;
  currentPhaseEndsAt: string | null;
  players: SessionPlayerView[];
  channels: ChannelView[];
  pendingIntentTypes: IntentType[];
  systemEvents: SystemEventView[];
}

export interface LobbyCommandSuccess {
  lobby: LobbyView;
  playerId: string;
  reconnectToken: string;
}

export interface StartGameSuccess {
  lobby: LobbyView;
  session: SessionView;
}

export interface SubmitIntentSuccess {
  acceptedIntentId: string;
  session: SessionView;
}

export interface ChatMessageView {
  messageId: string;
  lobbyCode: string;
  gameId: string | null;
  senderPlayerId: string;
  senderDisplayName: string;
  channelId: 'global';
  text: string;
  createdAt: string;
}

export interface ChatSendSuccess {
  message: ChatMessageView;
}

export interface SocketReadyPayload {
  lobbyCode: string | null;
  playerId: string | null;
  sessionId: string | null;
}
