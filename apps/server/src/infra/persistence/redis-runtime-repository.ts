import type { Redis } from 'ioredis';

import type { GameState } from '../../domain/game/types.js';
import type { LobbyState } from '../../domain/lobby/types.js';
import type {
  PresenceBinding,
  RuntimeRepository,
} from '../../domain/repositories.js';

const lobbyKey = (code: string) => `lobby:${code}`;
const sessionKey = (gameId: string) => `session:${gameId}`;
const socketPresenceKey = (socketId: string) => `presence:socket:${socketId}`;
const playerPresenceKey = (lobbyCode: string, playerId: string) =>
  `presence:player:${lobbyCode}:${playerId}`;

export class RedisRuntimeRepository implements RuntimeRepository {
  constructor(private readonly redis: Redis) {}

  async lobbyCodeExists(code: string): Promise<boolean> {
    return (await this.redis.exists(lobbyKey(code))) === 1;
  }

  async getLobby(code: string): Promise<LobbyState | null> {
    const value = await this.redis.get(lobbyKey(code));
    return value ? (JSON.parse(value) as LobbyState) : null;
  }

  async saveLobby(lobby: LobbyState): Promise<void> {
    await this.redis.set(lobbyKey(lobby.code), JSON.stringify(lobby));
  }

  async getSession(gameId: string): Promise<GameState | null> {
    const value = await this.redis.get(sessionKey(gameId));
    return value ? (JSON.parse(value) as GameState) : null;
  }

  async saveSession(session: GameState): Promise<void> {
    await this.redis.set(sessionKey(session.gameId), JSON.stringify(session));
  }

  async bindSocket(binding: PresenceBinding): Promise<void> {
    await this.redis.set(
      socketPresenceKey(binding.socketId),
      JSON.stringify(binding),
    );
    await this.redis.set(
      playerPresenceKey(binding.lobbyCode, binding.playerId),
      JSON.stringify(binding),
    );
  }

  async getPresenceBySocket(socketId: string): Promise<PresenceBinding | null> {
    const value = await this.redis.get(socketPresenceKey(socketId));
    return value ? (JSON.parse(value) as PresenceBinding) : null;
  }

  async clearSocket(socketId: string): Promise<PresenceBinding | null> {
    const binding = await this.getPresenceBySocket(socketId);

    if (!binding) {
      return null;
    }

    await this.redis.del(socketPresenceKey(socketId));
    await this.redis.del(playerPresenceKey(binding.lobbyCode, binding.playerId));

    return binding;
  }

  async clearPlayerPresence(
    lobbyCode: string,
    playerId: string,
  ): Promise<PresenceBinding | null> {
    const value = await this.redis.get(playerPresenceKey(lobbyCode, playerId));

    if (!value) {
      return null;
    }

    const binding = JSON.parse(value) as PresenceBinding;
    await this.redis.del(playerPresenceKey(lobbyCode, playerId));
    await this.redis.del(socketPresenceKey(binding.socketId));
    return binding;
  }
}
