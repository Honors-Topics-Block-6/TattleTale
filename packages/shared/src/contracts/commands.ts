import type { LobbySettingsView } from './views.js';
import type { IntentType } from '../enums.js';

export interface CreateLobbyCommand {
  displayName: string;
  settings?: Partial<LobbySettingsView>;
}

export interface JoinLobbyCommand {
  lobbyCode: string;
  displayName: string;
}

export interface ReconnectCommand {
  lobbyCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface LeaveLobbyCommand {
  lobbyCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface KickPlayerCommand {
  lobbyCode: string;
  actorPlayerId: string;
  targetPlayerId: string;
  reconnectToken: string;
}

export interface StartGameCommand {
  lobbyCode: string;
  actorPlayerId: string;
  reconnectToken: string;
}

export interface SendMessageIntentPayload {
  channelId: string;
  content: string;
}

export interface VoteIntentPayload {
  targetPlayerId: string | null;
}

export interface NightActionIntentPayload {
  actionType: string;
  targetPlayerId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SubmitIntentCommand {
  lobbyCode: string;
  gameId: string;
  playerId: string;
  reconnectToken: string;
  intent: {
    type: IntentType;
    payload: SendMessageIntentPayload | VoteIntentPayload | NightActionIntentPayload | Record<string, unknown>;
    clientTimestamp: string;
  };
}
