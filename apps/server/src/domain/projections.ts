import type { LobbyView, SessionView } from '@tattletale/shared';

import type { GameState } from './game/types.js';
import type { LobbyState } from './lobby/types.js';

export function toLobbyView(lobby: LobbyState): LobbyView {
  return {
    code: lobby.code,
    status: lobby.status,
    hostPlayerId: lobby.hostPlayerId,
    players: lobby.players.map((player) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      isHost: player.isHost,
      ready: player.ready,
      connected: player.connected,
      alive: player.alive,
    })),
    settings: { ...lobby.settings },
    sessionId: lobby.sessionId,
  };
}

export function toSessionView(session: GameState): SessionView {
  return {
    gameId: session.gameId,
    lobbyCode: session.lobbyCode,
    status: session.status,
    phase: session.phase,
    cycle: session.cycle,
    currentPhaseEndsAt: session.timers.currentPhaseEndsAt,
    players: Object.values(session.players).map((player) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      alive: player.alive,
      connected: player.connected,
    })),
    channels: Object.values(session.channels).map((channel) => ({
      id: channel.id,
      type: channel.type,
      members: [...channel.members],
      locked: channel.locked,
      expiresAt: channel.expiresAt,
    })),
    pendingIntentTypes: session.pendingIntents.map((intent) => intent.type),
    systemEvents: session.systemEvents.map((event) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
    })),
  };
}
