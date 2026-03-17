import type { GameState } from '../../domain/game/types.js';
import type { LobbyState } from '../../domain/lobby/types.js';
import type {
  CreateGameRecordInput,
  GameAuditRepository,
  MessageAuditEventInput,
  PresenceBinding,
  RuntimeRepository,
  SessionAuditEventInput,
} from '../../domain/repositories.js';

export class InMemoryRuntimeRepository implements RuntimeRepository {
  private readonly lobbies = new Map<string, LobbyState>();
  private readonly sessions = new Map<string, GameState>();
  private readonly socketPresence = new Map<string, PresenceBinding>();
  private readonly playerPresence = new Map<string, PresenceBinding>();

  async lobbyCodeExists(code: string): Promise<boolean> {
    return this.lobbies.has(code);
  }

  async getLobby(code: string): Promise<LobbyState | null> {
    const value = this.lobbies.get(code);
    return value ? structuredClone(value) : null;
  }

  async saveLobby(lobby: LobbyState): Promise<void> {
    this.lobbies.set(lobby.code, structuredClone(lobby));
  }

  async getSession(gameId: string): Promise<GameState | null> {
    const value = this.sessions.get(gameId);
    return value ? structuredClone(value) : null;
  }

  async saveSession(session: GameState): Promise<void> {
    this.sessions.set(session.gameId, structuredClone(session));
  }

  async bindSocket(binding: PresenceBinding): Promise<void> {
    this.socketPresence.set(binding.socketId, structuredClone(binding));
    this.playerPresence.set(`${binding.lobbyCode}:${binding.playerId}`, structuredClone(binding));
  }

  async getPresenceBySocket(socketId: string): Promise<PresenceBinding | null> {
    const value = this.socketPresence.get(socketId);
    return value ? structuredClone(value) : null;
  }

  async clearSocket(socketId: string): Promise<PresenceBinding | null> {
    const binding = this.socketPresence.get(socketId);
    if (!binding) return null;

    this.socketPresence.delete(socketId);
    this.playerPresence.delete(`${binding.lobbyCode}:${binding.playerId}`);
    return structuredClone(binding);
  }

  async clearPlayerPresence(lobbyCode: string, playerId: string): Promise<PresenceBinding | null> {
    const key = `${lobbyCode}:${playerId}`;
    const binding = this.playerPresence.get(key);
    if (!binding) return null;

    this.playerPresence.delete(key);
    this.socketPresence.delete(binding.socketId);
    return structuredClone(binding);
  }
}

export class InMemoryAuditRepository implements GameAuditRepository {
  async createGameRecord(_input: CreateGameRecordInput): Promise<void> {}
  async appendSessionEvent(_input: SessionAuditEventInput): Promise<void> {}
  async appendMessageAudit(_input: MessageAuditEventInput): Promise<void> {}
}
