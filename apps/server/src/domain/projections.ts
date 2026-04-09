import type { LobbyView, SessionView, PlayerSessionView } from '@tattletale/shared';

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

export function toPlayerSessionView(session: GameState, playerId: string): PlayerSessionView {
  const player = session.players[playerId];
  return {
    gameId: session.gameId,
    lobbyCode: session.lobbyCode,
    status: session.status,
    phase: session.phase,
    cycle: session.cycle,
    currentPhaseEndsAt: session.timers.currentPhaseEndsAt,
    players: Object.values(session.players).map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      alive: p.alive,
      connected: p.connected,
    })),
    channels: Object.values(session.channels)
      .filter((ch) => ch.members.includes(playerId))
      .map((ch) => ({ id: ch.id, type: ch.type, members: [...ch.members], locked: ch.locked, expiresAt: ch.expiresAt })),
    myPendingIntentTypes: session.pendingIntents
      .filter((intent) => intent.playerId === playerId)
      .map((intent) => intent.type),
    systemEvents: session.systemEvents.map((event) => ({ id: event.id, type: event.type, createdAt: event.createdAt })),
    myRole: player?.roleId ?? 'unknown',
    myTeam: player?.team ?? ('FRIENDS' as any),
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
