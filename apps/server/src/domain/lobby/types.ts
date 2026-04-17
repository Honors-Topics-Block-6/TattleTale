import { RoleId } from '@tattletale/shared';
import type { LobbyStatus } from '@tattletale/shared';

export interface LobbySettings {
  minPlayers: number;
  maxPlayers: number;
  dayDurationSeconds: number;
  nightDurationSeconds: number;
  enabledRoles: string[];
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
  createdAt: string;
  updatedAt: string;
  /** Monotonically incrementing version. Bumped on every mutation. Used for optimistic locking. */
  revision: number;
}

/** Bump updatedAt and revision atomically. Call on every lobby mutation so optimistic locks stay coherent. */
export function touchLobby(lobby: LobbyState, now: string): void {
  lobby.updatedAt = now;
  lobby.revision += 1;
}

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  minPlayers: 7,
  maxPlayers: 20,
  dayDurationSeconds: 180,
  nightDurationSeconds: 60,
  enabledRoles: [
    RoleId.EXTROVERT,
    RoleId.WHITE_HAT_HACKER,
    RoleId.SECURITY_SPECIALIST,
    RoleId.THE_BOSS,
    RoleId.SIGNAL_JAMMER,
    RoleId.EAVESDROPPER,
    RoleId.TROLLER,
    RoleId.IMITATOR,
  ],
};
