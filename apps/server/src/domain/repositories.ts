import type { GameState } from './game/types.js';
import type { LobbyState } from './lobby/types.js';

export interface RuntimeRepository {
  getLobby(): Promise<LobbyState | null>;
  saveLobby(lobby: LobbyState): Promise<void>;
  getSession(): Promise<GameState | null>;
  saveSession(session: GameState): Promise<void>;
  deleteLobby(): Promise<void>;
  deleteSession(): Promise<void>;
}

export interface PlayerConnectionRecord {
  reconnectToken: string;
  tokenIssuedAt: number;
  lastDisconnectedAt?: number;
  kickedAt?: number;
}

export interface PersistedPhaseDeadline {
  phase: string;
  cycle: number;
  deadlineMs: number;
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
    team: string;
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
