import {
  IntentType,
  Phase,
  SessionStatus,
  SystemEventType,
  Team,
  type SystemEventMetadata,
} from '@tattletale/shared';

import { SystemEventMetadataBuilders } from './system-events.js';

import type { LobbySettings, LobbyState } from '../lobby/types.js';
import type {
  GameState,
  NightActionIntentPayload,
  PlayerIntent,
  VoteIntentPayload,
} from './types.js';

// Temporary default split from TechSpec v1; treat as tunable during playtesting.
const SYSTEM_EVENT_CAP = 50;
const DAY_PHASE_WEIGHTS = [70, 20, 10] as const;
const NIGHT_PHASE_WEIGHTS = [75, 15, 10] as const;
const ABSTAIN_VOTE_KEY = '__ABSTAIN__';

export interface RuntimePhaseAdvancedEvent {
  type: 'PHASE_ADVANCED';
  phase: Phase;
  cycle: number;
  at: string;
}

export interface RuntimePlayerEliminatedEvent {
  type: 'PLAYER_ELIMINATED';
  playerId: string;
  reason: 'DAY_VOTE' | 'NIGHT_KILL' | 'PLAYER_LEFT' | 'PLAYER_KICKED';
  at: string;
}

export interface RuntimeGameEndedEvent {
  type: 'GAME_ENDED';
  winnerTeam: Team;
  status: SessionStatus;
  at: string;
}

export type RuntimeEvent =
  | RuntimePhaseAdvancedEvent
  | RuntimePlayerEliminatedEvent
  | RuntimeGameEndedEvent;

export interface IntentAppendInput {
  playerId: string;
  type: IntentType.SUBMIT_VOTE | IntentType.SUBMIT_NIGHT_ACTION;
  payload: VoteIntentPayload | NightActionIntentPayload;
  phase: Phase;
  cycle: number;
  createdAt: string;
}

export type IntentAppendResult =
  | { accepted: true; intent: PlayerIntent }
  | { accepted: false; reason: 'DUPLICATE_VOTE' };

export function calculatePhaseDurations(
  settings: LobbySettings,
): Record<Phase, number> {
  const [dayOpen, dayVote, dayResolve] = splitDuration(
    settings.dayDurationSeconds,
    DAY_PHASE_WEIGHTS,
  );
  const [nightActions, nightResolve, nightReveal] = splitDuration(
    settings.nightDurationSeconds,
    NIGHT_PHASE_WEIGHTS,
  );

  return {
    [Phase.DAY_OPEN]: dayOpen,
    [Phase.DAY_VOTE]: dayVote,
    [Phase.DAY_RESOLVE]: dayResolve,
    [Phase.NIGHT_ACTIONS]: nightActions,
    [Phase.NIGHT_RESOLVE]: nightResolve,
    [Phase.NIGHT_REVEAL]: nightReveal,
  };
}

export function initializeSessionRuntime(
  session: GameState,
  settings: LobbySettings,
  now: string,
  random: () => number = Math.random,
): void {
  assignTeams(session, random);

  // Populate hacker channel with assigned Team.HACKERS players.
  if (session.channels.hacker) {
    session.channels.hacker.members = Object.values(session.players)
      .filter((p) => p.team === Team.HACKERS)
      .map((p) => p.playerId);
  }

  session.status = SessionStatus.ACTIVE;
  session.winnerTeam = null;
  const durationSeconds = calculatePhaseDurations(settings)[session.phase];
  session.timers.currentPhaseEndsAt = addSeconds(now, durationSeconds);
  session.timers.currentPhaseDurationSeconds = durationSeconds;
  session.updatedAt = now;
}

export function isIntentAllowedInPhase(
  type: IntentType,
  phase: Phase,
): boolean {
  if (type === IntentType.SUBMIT_VOTE) {
    return phase === Phase.DAY_VOTE;
  }

  if (type === IntentType.SUBMIT_NIGHT_ACTION) {
    return phase === Phase.NIGHT_ACTIONS;
  }

  return false;
}

export function appendIntent(
  session: GameState,
  input: IntentAppendInput,
): IntentAppendResult {
  if (input.type === IntentType.SUBMIT_VOTE) {
    const hasExistingVote = session.pendingIntents.some(
      (intent) =>
        intent.type === IntentType.SUBMIT_VOTE
        && intent.playerId === input.playerId
        && intent.cycle === input.cycle,
    );

    if (hasExistingVote) {
      return {
        accepted: false,
        reason: 'DUPLICATE_VOTE',
      };
    }

    const intent: PlayerIntent = {
      id: crypto.randomUUID(),
      playerId: input.playerId,
      type: input.type,
      payload: input.payload,
      cycle: input.cycle,
      phase: input.phase,
      createdAt: input.createdAt,
    };
    session.pendingIntents.push(intent);
    return {
      accepted: true,
      intent,
    };
  }

  session.pendingIntents = session.pendingIntents.filter(
    (intent) =>
      !(
        intent.type === IntentType.SUBMIT_NIGHT_ACTION
        && intent.playerId === input.playerId
        && intent.cycle === input.cycle
      ),
  );

  const intent: PlayerIntent = {
    id: crypto.randomUUID(),
    playerId: input.playerId,
    type: input.type,
    payload: input.payload,
    cycle: input.cycle,
    phase: input.phase,
    createdAt: input.createdAt,
  };
  session.pendingIntents.push(intent);
  return {
    accepted: true,
    intent,
  };
}

export function reconcileSessionRuntime(
  session: GameState,
  lobby: LobbyState,
  settings: LobbySettings,
  now: string,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  if (session.status !== SessionStatus.ACTIVE || !session.timers.currentPhaseEndsAt) {
    return events;
  }

  const nowMs = Date.parse(now);
  if (Date.parse(session.timers.currentPhaseEndsAt) > nowMs) {
    return events;
  }

  const transitionAt = now;
  const previousPhase = session.phase;
  const previousCycle = session.cycle;

  if (previousPhase === Phase.DAY_VOTE) {
    const eliminationTarget = resolveDayVoteEliminationTarget(session);
    const targetName = eliminationTarget ? session.players[eliminationTarget]?.displayName : undefined;

    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_VOTE);

    if (eliminationTarget && eliminatePlayer(session, lobby, eliminationTarget, transitionAt)) {
      events.push({
        type: 'PLAYER_ELIMINATED',
        playerId: eliminationTarget,
        reason: 'DAY_VOTE',
        at: transitionAt,
      });
      appendSystemEvent(session, SystemEventType.PLAYER_VOTED_OUT, transitionAt,
        SystemEventMetadataBuilders.playerVotedOut(eliminationTarget, targetName ?? ''));

      const winnerTeam = applyWinState(session, transitionAt);
      if (winnerTeam) {
        events.push({
          type: 'GAME_ENDED',
          winnerTeam,
          status: session.status,
          at: transitionAt,
        });
      }
    }
  } else if (previousPhase === Phase.NIGHT_ACTIONS) {
    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_NIGHT_ACTION);
  }

  if (session.status !== SessionStatus.ACTIVE) {
    return events;
  }

  const next = nextPhase(previousPhase, previousCycle);
  session.phase = next.phase;
  session.cycle = next.cycle;
  const nextDurationSeconds = calculatePhaseDurations(settings)[session.phase];
  session.timers.currentPhaseEndsAt = addSeconds(transitionAt, nextDurationSeconds);
  session.timers.currentPhaseDurationSeconds = nextDurationSeconds;
  session.updatedAt = transitionAt;

  events.push({
    type: 'PHASE_ADVANCED',
    phase: session.phase,
    cycle: session.cycle,
    at: transitionAt,
  });

  return events;
}

export function processElimination(
  session: GameState,
  lobby: LobbyState,
  playerId: string,
  now: string,
  reason: RuntimePlayerEliminatedEvent['reason'],
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  if (!eliminatePlayer(session, lobby, playerId, now)) {
    return events;
  }

  events.push({
    type: 'PLAYER_ELIMINATED',
    playerId,
    reason,
    at: now,
  });

  const winnerTeam = applyWinState(session, now);
  if (winnerTeam) {
    events.push({
      type: 'GAME_ENDED',
      winnerTeam,
      status: session.status,
      at: now,
    });
  }

  return events;
}

function splitDuration(
  totalSeconds: number,
  weights: readonly [number, number, number],
): [number, number, number] {
  const phaseCount = weights.length;
  const minimumPerPhase = 1;
  const guaranteed = phaseCount * minimumPerPhase;
  const distributable = Math.max(0, totalSeconds - guaranteed);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);

  const allocated = weights.map((weight) =>
    Math.floor((distributable * weight) / weightTotal),
  );
  const remainder = distributable - allocated.reduce((sum, value) => sum + value, 0);
  allocated[0] += remainder;

  return [
    allocated[0] + minimumPerPhase,
    allocated[1] + minimumPerPhase,
    allocated[2] + minimumPerPhase,
  ];
}

function addSeconds(isoTimestamp: string, seconds: number): string {
  return new Date(Date.parse(isoTimestamp) + (seconds * 1000)).toISOString();
}

function chooseHackerCount(playerCount: number): number {
  if (playerCount >= 16) {
    return 4;
  }

  if (playerCount >= 11) {
    return 3;
  }

  return 2;
}

function assignTeams(
  session: GameState,
  random: () => number,
): void {
  const playerIds = Object.keys(session.players);
  const shuffled = [...playerIds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  const hackerCount = chooseHackerCount(shuffled.length);
  const hackerIds = new Set(shuffled.slice(0, hackerCount));

  for (const [playerId, player] of Object.entries(session.players)) {
    player.team = hackerIds.has(playerId) ? Team.HACKERS : Team.FRIENDS;
  }
}

function appendSystemEvent(
  session: GameState,
  type: SystemEventType,
  now: string,
  metadata: SystemEventMetadata,
): void {
  session.systemEvents.push({
    id: crypto.randomUUID(),
    type,
    createdAt: now,
    metadata,
  });
  if (session.systemEvents.length > SYSTEM_EVENT_CAP) {
    session.systemEvents.splice(0, session.systemEvents.length - SYSTEM_EVENT_CAP);
  }
}

function clearCycleIntents(
  session: GameState,
  cycle: number,
  type: IntentType.SUBMIT_VOTE | IntentType.SUBMIT_NIGHT_ACTION,
): void {
  session.pendingIntents = session.pendingIntents.filter(
    (intent) => !(intent.type === type && intent.cycle === cycle),
  );
}

function resolveDayVoteEliminationTarget(session: GameState): string | null {
  const alivePlayers = Object.values(session.players).filter((player) => player.alive);
  const voteSelections = new Map<string, string | null>();
  const voteIntents = session.pendingIntents.filter(
    (intent) =>
      intent.type === IntentType.SUBMIT_VOTE && intent.cycle === session.cycle,
  );

  for (const intent of voteIntents) {
    const payload = intent.payload as VoteIntentPayload;
    const isValidTarget = payload.targetPlayerId !== null
      && Boolean(session.players[payload.targetPlayerId]?.alive);
    voteSelections.set(intent.playerId, isValidTarget ? payload.targetPlayerId : null);
  }

  const tally = new Map<string, number>();
  for (const player of alivePlayers) {
    const key = voteSelections.get(player.playerId) ?? ABSTAIN_VOTE_KEY;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  let highestCount = -1;
  let leaders: string[] = [];

  for (const [candidate, count] of tally.entries()) {
    if (count > highestCount) {
      highestCount = count;
      leaders = [candidate];
      continue;
    }

    if (count === highestCount) {
      leaders.push(candidate);
    }
  }

  if (leaders.length !== 1) {
    return null;
  }

  const winner = leaders[0];
  if (winner === ABSTAIN_VOTE_KEY) {
    return null;
  }

  return winner;
}

function eliminatePlayer(
  session: GameState,
  lobby: LobbyState,
  playerId: string,
  now: string,
): boolean {
  const sessionPlayer = session.players[playerId];
  if (!sessionPlayer || !sessionPlayer.alive) {
    return false;
  }

  sessionPlayer.alive = false;
  session.pendingIntents = session.pendingIntents.filter(
    (intent) => intent.playerId !== playerId,
  );
  for (const channel of Object.values(session.channels)) {
    channel.members = channel.members.filter((memberId) => memberId !== playerId);
  }

  const lobbyPlayer = lobby.players.find((player) => player.playerId === playerId);
  if (lobbyPlayer) {
    lobbyPlayer.alive = false;
  }

  session.updatedAt = now;
  lobby.updatedAt = now;
  return true;
}

function nextPhase(
  phase: Phase,
  cycle: number,
): { phase: Phase; cycle: number } {
  switch (phase) {
    case Phase.DAY_OPEN:
      return { phase: Phase.DAY_VOTE, cycle };
    case Phase.DAY_VOTE:
      return { phase: Phase.DAY_RESOLVE, cycle };
    case Phase.DAY_RESOLVE:
      return { phase: Phase.NIGHT_ACTIONS, cycle };
    case Phase.NIGHT_ACTIONS:
      return { phase: Phase.NIGHT_RESOLVE, cycle };
    case Phase.NIGHT_RESOLVE:
      return { phase: Phase.NIGHT_REVEAL, cycle };
    case Phase.NIGHT_REVEAL:
      return { phase: Phase.DAY_OPEN, cycle: cycle + 1 };
    default:
      return { phase, cycle };
  }
}

function applyWinState(
  session: GameState,
  now: string,
): Team | null {
  if (session.status !== SessionStatus.ACTIVE) {
    return session.winnerTeam;
  }

  const alivePlayers = Object.values(session.players).filter((player) => player.alive);
  const aliveCount = alivePlayers.length;
  const hackersAlive = alivePlayers.filter((player) => player.team === Team.HACKERS).length;

  if (hackersAlive === 0) {
    session.status = SessionStatus.FRIENDS_WIN;
    session.winnerTeam = Team.FRIENDS;
    session.timers.currentPhaseEndsAt = null;
    session.updatedAt = now;
    return Team.FRIENDS;
  }

  if (hackersAlive >= Math.ceil(aliveCount / 2)) {
    session.status = SessionStatus.HACKERS_WIN;
    session.winnerTeam = Team.HACKERS;
    session.timers.currentPhaseEndsAt = null;
    session.updatedAt = now;
    return Team.HACKERS;
  }

  return null;
}
