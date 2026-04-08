import type { GameState } from '../domain/game/types.js';
import type { LobbyState } from '../domain/lobby/types.js';
import type {
  RuntimeRepository,
  PlayerConnectionRecord,
  PersistedPhaseDeadline,
} from '../domain/repositories.js';

export class DORuntimeRepository implements RuntimeRepository {
  constructor(private storage: DurableObjectStorage) {}

  async getLobby(): Promise<LobbyState | null> {
    return (await this.storage.get<LobbyState>('lobby')) ?? null;
  }

  async saveLobby(lobby: LobbyState): Promise<void> {
    await this.storage.put('lobby', lobby);
  }

  async deleteLobby(): Promise<void> {
    await this.storage.delete('lobby');
  }

  async getSession(): Promise<GameState | null> {
    return (await this.storage.get<GameState>('game')) ?? null;
  }

  async saveSession(session: GameState): Promise<void> {
    await this.storage.put('game', session);
  }

  async deleteSession(): Promise<void> {
    await this.storage.delete('game');
  }

  // Player Connection Records
  async getPlayerRecord(playerId: string): Promise<PlayerConnectionRecord | null> {
    return (await this.storage.get<PlayerConnectionRecord>(`players:${playerId}`)) ?? null;
  }

  async savePlayerRecord(playerId: string, record: PlayerConnectionRecord): Promise<void> {
    await this.storage.put(`players:${playerId}`, record);
  }

  async deletePlayerRecord(playerId: string): Promise<void> {
    await this.storage.delete(`players:${playerId}`);
  }

  async deleteAllPlayerRecords(playerIds: string[]): Promise<void> {
    await this.storage.delete(playerIds.map((id) => `players:${id}`));
  }

  // Phase Deadline
  async getPhaseDeadline(): Promise<PersistedPhaseDeadline | null> {
    return (await this.storage.get<PersistedPhaseDeadline>('phaseDeadline')) ?? null;
  }

  async savePhaseDeadline(deadline: PersistedPhaseDeadline): Promise<void> {
    await this.storage.put('phaseDeadline', deadline);
  }

  async clearPhaseDeadline(): Promise<void> {
    await this.storage.delete('phaseDeadline');
  }
}
