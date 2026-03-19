import type { GameState } from './game/types.js';
import type { LobbyState } from './lobby/types.js';

export interface PresenceBinding {
  socketId: string;
  lobbyCode: string;
  playerId: string;
}

export interface RuntimeRepository {
  lobbyCodeExists(code: string): Promise<boolean>;
  getLobby(code: string): Promise<LobbyState | null>;
  saveLobby(lobby: LobbyState): Promise<void>;
  getSession(gameId: string): Promise<GameState | null>;
  saveSession(session: GameState): Promise<void>;
  bindSocket(binding: PresenceBinding): Promise<void>;
  getPresenceBySocket(socketId: string): Promise<PresenceBinding | null>;
  clearSocket(socketId: string): Promise<PresenceBinding | null>;
  clearPlayerPresence(
    lobbyCode: string,
    playerId: string,
  ): Promise<PresenceBinding | null>;
  addPublicLobby(code: string): Promise<void>;
  removePublicLobby(code: string): Promise<void>;
  listPublicLobbies(): Promise<LobbyState[]>;
}

export interface CreateGameRecordInput {
  gameId: string;
  lobbyCode: string;
  phase: string;
  cycle: number;
  players: Array<{
    playerId: string;
    displayName: string;
    alive: boolean;
    isHost: boolean;
    roleId: string | null;
    team: string | null;
  }>;
}

export interface SessionAuditEventInput {
  gameId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface MessageAuditEventInput {
  gameId: string;
  channelId: string;
  senderPlayerId: string;
  rawPayload: Record<string, unknown>;
  deliveredPayload?: Record<string, unknown> | null;
}

export interface GameAuditRepository {
  createGameRecord(input: CreateGameRecordInput): Promise<void>;
  appendSessionEvent(input: SessionAuditEventInput): Promise<void>;
  appendMessageAudit(input: MessageAuditEventInput): Promise<void>;
}
