import type { LobbySettingsView } from './views.js';

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

export interface SetLobbyReadyCommand {
  lobbyCode: string;
  playerId: string;
  reconnectToken: string;
  ready: boolean;
}
