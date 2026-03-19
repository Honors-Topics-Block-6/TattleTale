import { ChannelType, Phase, SystemEventType } from '@tattletale/shared';

import type { LobbyState } from '../lobby/types.js';
import type { GameState } from './types.js';

function shuffleInPlace<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
  return arr;
}

/**
 * Immediately enters the first Night cycle after a game starts:
 * - Assigns HACKER / FRIEND teams (roughly 1 hacker per 3 players, at least 1 hacker).
 * - Non-hackers are in sleep mode; hackers stay awake for night coordination.
 * - Adds a hackers-only ROLE channel.
 */
export function applyFirstNightAfterGameStart(
  session: GameState,
  lobby: LobbyState,
  now: string,
): void {
  const playerIds = Object.keys(session.players);
  const n = playerIds.length;
  const hackerCount = Math.max(1, Math.floor(n / 3));
  const hackers = new Set(shuffleInPlace(playerIds).slice(0, hackerCount));

  for (const playerId of playerIds) {
    const player = session.players[playerId];
    if (!player) continue;

    const isHacker = hackers.has(playerId);
    player.team = isHacker ? 'HACKER' : 'FRIEND';
    player.roleId = isHacker ? 'hacker' : 'friend';
    player.sleeping = !isHacker;
    player.permissions = isHacker ? ['NIGHT_ACTIVE'] : [];
  }

  session.phase = Phase.NIGHT_ACTIONS;
  const endsAtMs = new Date(now).getTime() + lobby.settings.nightDurationSeconds * 1000;
  session.timers.currentPhaseEndsAt = new Date(endsAtMs).toISOString();

  session.channels.hackers = {
    id: 'hackers',
    type: ChannelType.ROLE,
    members: [...hackers],
    locked: false,
    expiresAt: null,
  };

  session.systemEvents.push({
    id: crypto.randomUUID(),
    type: SystemEventType.NIGHT_CYCLE_STARTED,
    createdAt: now,
  });

  session.updatedAt = now;
}
