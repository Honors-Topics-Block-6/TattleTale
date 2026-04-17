import {
  ChannelType,
  IntentType,
  NightActionType,
  Phase,
  SessionStatus,
  SystemEventType,
  Team,
  type SystemEventMetadata,
} from '@tattletale/shared';

import { SystemEventMetadataBuilders } from './system-events.js';
import { NIGHT_ACTION_TIER } from './role-actions.js';

import type { LobbySettings, LobbyState } from '../lobby/types.js';
import type {
  ChannelState,
  GameState,
  NightActionIntentPayload,
  PlayerIntent,
  SystemEventState,
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

type EliminationResolution = {
  kind: 'ELIMINATE';
  targetPlayerId: string;
  targetDisplayName: string;
  reason: 'DAY_VOTE' | 'NIGHT_KILL';
} | {
  kind: 'NONE';
  reason: 'DAY_VOTE' | 'NIGHT_KILL';
};

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

function resolveDayVote(session: GameState): EliminationResolution {
  const targetId = resolveDayVoteEliminationTarget(session);
  if (!targetId) return { kind: 'NONE', reason: 'DAY_VOTE' };
  const name = session.players[targetId]?.displayName ?? '';
  return { kind: 'ELIMINATE', targetPlayerId: targetId, targetDisplayName: name, reason: 'DAY_VOTE' };
}

function resolveNightKill(session: GameState): EliminationResolution {
  const targetId = resolveHackerKillTarget(session);
  if (!targetId) return { kind: 'NONE', reason: 'NIGHT_KILL' };
  const name = session.players[targetId]?.displayName ?? '';
  return { kind: 'ELIMINATE', targetPlayerId: targetId, targetDisplayName: name, reason: 'NIGHT_KILL' };
}

function applyEliminationOutcome(
  session: GameState,
  lobby: LobbyState,
  resolution: EliminationResolution,
  transitionAt: string,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  if (resolution.kind === 'NONE') {
    if (resolution.reason === 'NIGHT_KILL') {
      appendSystemEvent(session, SystemEventType.NO_KILL_TONIGHT, transitionAt,
        SystemEventMetadataBuilders.noKillTonight());
    }
    return events;
  }

  const eliminated = eliminatePlayer(session, lobby, resolution.targetPlayerId, transitionAt);
  if (!eliminated) return events;

  events.push({
    type: 'PLAYER_ELIMINATED',
    playerId: resolution.targetPlayerId,
    reason: resolution.reason,
    at: transitionAt,
  });

  if (resolution.reason === 'DAY_VOTE') {
    appendSystemEvent(session, SystemEventType.PLAYER_VOTED_OUT, transitionAt,
      SystemEventMetadataBuilders.playerVotedOut(resolution.targetPlayerId, resolution.targetDisplayName));
  } else {
    appendSystemEvent(session, SystemEventType.PLAYER_KILLED_AT_NIGHT, transitionAt,
      SystemEventMetadataBuilders.playerKilledAtNight(resolution.targetPlayerId, resolution.targetDisplayName));
  }

  const winnerTeam = applyWinState(session, transitionAt);
  if (winnerTeam) {
    events.push({ type: 'GAME_ENDED', winnerTeam, status: session.status, at: transitionAt });
  }

  return events;
}

/**
 * Priority-ordered night-action resolver per design doc §Night Resolution.
 *
 * Tiers:
 *   1. PROTECT                          — build protected-player set
 *   2. INVESTIGATE, MONITOR             — record private information
 *   3. JAM, MISDIRECT, IMITATE          — record communication effects
 *   4. HACKER_KILL, VENGEFUL_KILL       — apply eliminations, respecting protection
 *   5. CREATE_TEMP_CHAT, CHANNEL_LOCK,
 *      SWAP_ROLE                        — apply chat/role mutations
 *
 * Each tier runs to completion before the next starts. This ordering is authoritative —
 * changing it changes game balance. HACKER_KILL semantics (plurality vote among living
 * Hackers) remain unchanged from the legacy resolver.
 */
export function resolveNightActions(
  session: GameState,
  lobby: LobbyState,
  transitionAt: string,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  const cycleNightActions = session.pendingIntents.filter(
    (intent): intent is PlayerIntent & { payload: NightActionIntentPayload } =>
      intent.type === IntentType.SUBMIT_NIGHT_ACTION && intent.cycle === session.cycle,
  );

  const byTier = (tier: 1 | 2 | 3 | 4 | 5) =>
    cycleNightActions.filter((intent) => NIGHT_ACTION_TIER[intent.payload.actionType] === tier);

  // ── Tier 1: Protection ───────────────────────────────────────────
  const protectedPlayerIds = new Set<string>();
  for (const intent of byTier(1)) {
    const submitter = session.players[intent.playerId];
    if (!submitter || !submitter.alive) continue;
    const target = intent.payload.targetPlayerId;
    if (!target) continue;
    const targetPlayer = session.players[target];
    if (!targetPlayer || !targetPlayer.alive) continue;
    protectedPlayerIds.add(target);
  }

  // ── Tier 2: Information-gathering ────────────────────────────────
  for (const intent of byTier(2)) {
    const submitter = session.players[intent.playerId];
    if (!submitter || !submitter.alive) continue;
    const target = intent.payload.targetPlayerId;
    if (!target) continue;
    const targetPlayer = session.players[target];
    if (!targetPlayer || !targetPlayer.alive) continue;

    if (intent.payload.actionType === NightActionType.INVESTIGATE) {
      appendPrivateSystemEvent(
        session,
        intent.playerId,
        SystemEventType.INVESTIGATION_RESULT,
        transitionAt,
        SystemEventMetadataBuilders.investigationResult(
          target,
          targetPlayer.displayName,
          targetPlayer.roleId,
          targetPlayer.team,
        ),
      );
    }
    // MONITOR: cross-cycle channel-activity tracking is deferred (see issue #74 follow-up).
    // The intent is accepted and resolved in tier order so the infrastructure is exercised.
  }

  // ── Tier 3: Communication interference ───────────────────────────
  // JAM / MISDIRECT / IMITATE require cross-cycle effect state (apply on next day).
  // Public placeholder events are now emitted so players see that interference occurred.
  // Cross-cycle effect application (actual message suppression / redirection) is still
  // deferred to a follow-up task — only the events are wired here.
  for (const intent of byTier(3)) {
    const submitter = session.players[intent.playerId];
    if (!submitter || !submitter.alive) continue;

    if (intent.payload.actionType === NightActionType.JAM) {
      appendSystemEvent(session, SystemEventType.COMMUNICATION_JAMMED, transitionAt,
        SystemEventMetadataBuilders.communicationJammed());
    } else if (intent.payload.actionType === NightActionType.MISDIRECT) {
      appendSystemEvent(session, SystemEventType.MESSAGE_INTEGRITY_COMPROMISED, transitionAt,
        SystemEventMetadataBuilders.messageIntegrityCompromised());
    } else if (intent.payload.actionType === NightActionType.IMITATE) {
      appendSystemEvent(session, SystemEventType.PSYCHIC_SIGNAL_RECEIVED, transitionAt,
        SystemEventMetadataBuilders.psychicSignalReceived());
    }
  }

  // ── Tier 4: Eliminations (kills respect tier-1 protection) ───────
  const killResolution = resolveNightKill(session);

  if (killResolution.kind === 'ELIMINATE' && protectedPlayerIds.has(killResolution.targetPlayerId)) {
    appendSystemEvent(
      session,
      SystemEventType.NIGHT_KILL_PROTECTED,
      transitionAt,
      SystemEventMetadataBuilders.nightKillProtected(
        killResolution.targetPlayerId,
        killResolution.targetDisplayName,
      ),
    );
  } else {
    events.push(...applyEliminationOutcome(session, lobby, killResolution, transitionAt));

    // Synchronous VENGEFUL_KILL: if the eliminated player pre-submitted a VENGEFUL_KILL,
    // their chosen target is eliminated immediately, provided they're alive and unprotected.
    // NOTE: we intentionally do NOT gate on session.status here — the hacker kill may have
    // already triggered a premature win-state flip inside applyEliminationOutcome. The
    // vengeful kill is a same-night follow-on that must fire regardless, and the final
    // win-condition is then re-evaluated after both deaths settle.
    if (killResolution.kind === 'ELIMINATE') {
      const vengefulIntent = byTier(4).find(
        (intent) =>
          intent.payload.actionType === NightActionType.VENGEFUL_KILL
          && intent.playerId === killResolution.targetPlayerId,
      );
      const vengefulTargetId = vengefulIntent?.payload.targetPlayerId ?? null;
      const vengefulTargetName = vengefulTargetId
        ? (session.players[vengefulTargetId]?.displayName ?? '')
        : '';
      if (vengefulTargetId && session.players[vengefulTargetId]?.alive) {
        if (protectedPlayerIds.has(vengefulTargetId)) {
          appendSystemEvent(
            session,
            SystemEventType.NIGHT_KILL_PROTECTED,
            transitionAt,
            SystemEventMetadataBuilders.nightKillProtected(
              vengefulTargetId,
              vengefulTargetName,
            ),
          );
        } else {
          const vengefulResolution: EliminationResolution = {
            kind: 'ELIMINATE',
            targetPlayerId: vengefulTargetId,
            targetDisplayName: vengefulTargetName,
            reason: 'NIGHT_KILL',
          };
          events.push(...applyEliminationOutcome(session, lobby, vengefulResolution, transitionAt));
        }
      }
    }
  }

  // ── Tier 5: Chat creation / modification / role swap ─────────────
  for (const intent of byTier(5)) {
    const submitter = session.players[intent.playerId];
    if (!submitter || !submitter.alive) continue;

    if (intent.payload.actionType === NightActionType.CREATE_TEMP_CHAT) {
      const targetId = intent.payload.targetPlayerId;
      if (!targetId || targetId === intent.playerId) continue;
      const targetPlayer = session.players[targetId];
      if (!targetPlayer || !targetPlayer.alive) continue;

      const channelId = `temp-${intent.id}`;
      if (session.channels[channelId]) continue;
      const newChannel: ChannelState = {
        id: channelId,
        type: ChannelType.TEMP,
        members: [intent.playerId, targetId],
        locked: false,
        expiresAt: Phase.DAY_RESOLVE,
      };
      session.channels[channelId] = newChannel;
      appendSystemEvent(
        session,
        SystemEventType.TEMP_CHANNEL_CREATED,
        transitionAt,
        SystemEventMetadataBuilders.tempChannelCreated(channelId),
      );
    } else if (intent.payload.actionType === NightActionType.CHANNEL_LOCK) {
      // Prefer the dedicated targetChannelId field; fall back to targetPlayerId for backward
      // compat with in-flight payloads submitted before clients migrated.
      // TODO: remove the targetPlayerId fallback once all clients send targetChannelId.
      const channelId = intent.payload.targetChannelId ?? intent.payload.targetPlayerId;
      if (!channelId) continue;
      const channel = session.channels[channelId];
      // SYSTEM and HACKER channels cannot be locked — FIREWALL operates on public/TEMP channels only.
      if (!channel || channel.type === ChannelType.SYSTEM || channel.type === ChannelType.HACKER) continue;
      if (channel.locked) continue;
      channel.locked = true;
      appendSystemEvent(
        session,
        SystemEventType.CHANNEL_LOCKED,
        transitionAt,
        SystemEventMetadataBuilders.channelLocked(channelId),
      );
    }
    // SWAP_ROLE: requires role assignment to be meaningful. Deferred.
  }

  return events;
}

function appendPrivateSystemEvent(
  session: GameState,
  playerId: string,
  type: SystemEventType,
  now: string,
  metadata: SystemEventMetadata,
): void {
  // Lazy-init guard: kept for backward compatibility with sessions persisted before
  // privateSystemEvents was introduced — those may deserialize without the field.
  if (!session.privateSystemEvents) {
    session.privateSystemEvents = {};
  }
  const entry: SystemEventState = {
    id: crypto.randomUUID(),
    type,
    createdAt: now,
    metadata,
  };
  const bucket = session.privateSystemEvents[playerId] ?? [];
  bucket.push(entry);
  if (bucket.length > SYSTEM_EVENT_CAP) {
    bucket.splice(0, bucket.length - SYSTEM_EVENT_CAP);
  }
  session.privateSystemEvents[playerId] = bucket;
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
    const resolution = resolveDayVote(session);
    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_VOTE);
    events.push(...applyEliminationOutcome(session, lobby, resolution, transitionAt));
  } else if (previousPhase === Phase.NIGHT_ACTIONS) {
    events.push(...resolveNightActions(session, lobby, transitionAt));
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

function resolveHackerKillTarget(session: GameState): string | null {
  const livingHackers = Object.values(session.players)
    .filter((p) => p.alive && p.team === Team.HACKERS);

  if (livingHackers.length === 0) {
    return null;
  }
  const livingHackerIds = new Set(livingHackers.map((p) => p.playerId));

  const latestPerHacker = new Map<string, { targetPlayerId: string | null; createdAt: string }>();
  for (const intent of session.pendingIntents) {
    if (intent.type !== IntentType.SUBMIT_NIGHT_ACTION) continue;
    if (intent.cycle !== session.cycle) continue;
    if (!livingHackerIds.has(intent.playerId)) continue;
    const payload = intent.payload as NightActionIntentPayload;
    if (payload.actionType !== NightActionType.HACKER_KILL) continue;

    const existing = latestPerHacker.get(intent.playerId);
    if (!existing || intent.createdAt > existing.createdAt) {
      latestPerHacker.set(intent.playerId, {
        targetPlayerId: payload.targetPlayerId ?? null,
        createdAt: intent.createdAt,
      });
    }
  }

  const tally = new Map<string, number>();
  for (const hackerId of livingHackerIds) {
    const submitted = latestPerHacker.get(hackerId);
    const target = submitted?.targetPlayerId ?? null;
    const targetPlayer = target ? session.players[target] : undefined;
    const valid =
      target !== null
      && target !== hackerId
      && targetPlayer !== undefined
      && targetPlayer.alive
      && targetPlayer.team !== Team.HACKERS;
    const key = valid ? target! : ABSTAIN_VOTE_KEY;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  let highest = -1;
  let leaders: string[] = [];
  for (const [k, v] of tally) {
    if (v > highest) { highest = v; leaders = [k]; }
    else if (v === highest) { leaders.push(k); }
  }
  if (leaders.length !== 1) return null;
  return leaders[0] === ABSTAIN_VOTE_KEY ? null : leaders[0];
}

export function resolveHackerKillTargetForTest(session: GameState): string | null {
  return resolveHackerKillTarget(session);
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
