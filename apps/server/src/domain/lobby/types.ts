import type { LobbyStatus } from '@tattletale/shared';

export interface LobbySettings {
  minPlayers: number;
  maxPlayers: number;
  dayDurationSeconds: number;
  nightDurationSeconds: number;
}

export interface LobbyPlayerState {
  playerId: string;
  displayName: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  alive: boolean;
  reconnectToken: string;
  joinedAt: string;
}

export interface LobbyState {
  code: string;
  status: LobbyStatus;
  hostPlayerId: string;
  players: LobbyPlayerState[];
  settings: LobbySettings;
  sessionId: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  minPlayers: 7,
  maxPlayers: 20,
  dayDurationSeconds: 180,
  nightDurationSeconds: 60,
};
