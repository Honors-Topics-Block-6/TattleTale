import { IntentType, Phase, Team, type LobbyView, type SessionView, type PlayerSessionView, type HackerNightView } from '@tattletale/shared';

import type { GameState, NightActionIntentPayload, VoteIntentPayload } from './game/types.js';
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

  // Aggregate current-cycle SUBMIT_VOTE intents into a tally keyed by target.
  const voteTally: Record<string, number> = {};
  let voteTallyHasAny = false;
  for (const intent of session.pendingIntents) {
    if (intent.type !== IntentType.SUBMIT_VOTE) continue;
    if (intent.cycle !== session.cycle) continue;
    const target = (intent.payload as VoteIntentPayload).targetPlayerId;
    if (!target) continue;
    voteTally[target] = (voteTally[target] ?? 0) + 1;
    voteTallyHasAny = true;
  }

  // Hacker-scoped night fields.
  let myTeammates: string[] = [];
  let hackerNightView: HackerNightView | null = null;

  if (player?.alive && player.team === Team.HACKERS) {
    myTeammates = Object.values(session.players)
      .filter((p) => p.alive && p.team === Team.HACKERS && p.playerId !== playerId)
      .map((p) => p.playerId);

    if (session.phase === Phase.NIGHT_ACTIONS) {
      const tally: Record<string, number> = {};
      let confirmedTarget: string | null = null;

      // Defensive last-write-wins: collect latest HACKER_KILL intent per living Hacker.
      const livingHackerIds = new Set(
        Object.values(session.players)
          .filter((p) => p.alive && p.team === Team.HACKERS)
          .map((p) => p.playerId),
      );
      const latestPerHacker = new Map<string, { target: string | null; createdAt: string }>();
      for (const intent of session.pendingIntents) {
        if (intent.type !== IntentType.SUBMIT_NIGHT_ACTION) continue;
        if (intent.cycle !== session.cycle) continue;
        if (!livingHackerIds.has(intent.playerId)) continue;
        const payload = intent.payload as NightActionIntentPayload;
        if (payload.actionType !== 'HACKER_KILL') continue;
        const existing = latestPerHacker.get(intent.playerId);
        if (!existing || intent.createdAt > existing.createdAt) {
          latestPerHacker.set(intent.playerId, {
            target: payload.targetPlayerId ?? null,
            createdAt: intent.createdAt,
          });
        }
      }
      for (const { target } of latestPerHacker.values()) {
        if (target) tally[target] = (tally[target] ?? 0) + 1;
      }
      confirmedTarget = latestPerHacker.get(playerId)?.target ?? null;

      hackerNightView = { tally, confirmedTarget };
    }
  }

  return {
    gameId: session.gameId,
    lobbyCode: session.lobbyCode,
    status: session.status,
    phase: session.phase,
    cycle: session.cycle,
    currentPhaseEndsAt: session.timers.currentPhaseEndsAt,
    phaseDurationSeconds: session.timers.currentPhaseDurationSeconds,
    voteTally: voteTallyHasAny ? voteTally : null,
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
    systemEvents: session.systemEvents.map((event) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
      metadata: event.metadata,
    })),
    myRole: player?.roleId ?? 'unknown',
    myTeam: player?.team ?? ('FRIENDS' as any),
    myTeammates,
    hackerNightView,
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
      metadata: event.metadata,
    })),
  };
}
