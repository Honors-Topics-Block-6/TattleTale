import { ChannelType, MessageErrorCode, Phase, RestrictionType } from '@tattletale/shared';
import { describe, expect, it } from 'vitest';

import type { ChannelState, GameState } from './types.js';
import {
  RestrictionBuilders,
  applyRestriction,
  clearExpiredRestrictions,
  evaluateOutboundMessage,
  scramble,
} from './restrictions.js';

const NOW = '2026-03-17T00:00:00.000Z';

function emptySession(): GameState {
  // Minimal shape — only the fields the restrictions module touches. The
  // union covers everything else on GameState via `as any` casts below
  // intentionally avoided; we build the exact subset.
  return {
    gameId: 'g',
    lobbyCode: 'ABCDE',
    status: 'ACTIVE' as any,
    winnerTeam: null,
    phase: Phase.DAY_OPEN,
    cycle: 1,
    players: {
      sender: { playerId: 'sender', displayName: 'Sender', alive: true, connected: true, roleId: null, team: 'FRIENDS' as any, permissions: [] },
      obs: { playerId: 'obs', displayName: 'Obs', alive: true, connected: true, roleId: null, team: 'FRIENDS' as any, permissions: [] },
    },
    channels: {},
    pendingIntents: [],
    systemEvents: [],
    restrictions: [],
    timers: { currentPhaseEndsAt: null, currentPhaseDurationSeconds: 0 },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function channel(id: string, type: ChannelType, members: string[] = ['sender']): ChannelState {
  return { id, type, members, locked: false, expiresAt: null };
}

describe('applyRestriction', () => {
  it('appends when no existing restriction matches the scope', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.locked('global', 'firewall', Phase.DAY_RESOLVE, NOW));
    expect(session.restrictions).toHaveLength(1);
    expect(session.restrictions![0].type).toBe(RestrictionType.LOCKED);
  });

  it('replaces same-scope same-type (refreshes expiry, does not stack)', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.locked('global', 'firewall-a', Phase.DAY_RESOLVE, NOW));
    applyRestriction(session, RestrictionBuilders.locked('global', 'firewall-b', Phase.NIGHT_REVEAL, NOW));
    expect(session.restrictions).toHaveLength(1);
    const [r] = session.restrictions!;
    expect(r.type).toBe(RestrictionType.LOCKED);
    if (r.type === RestrictionType.LOCKED) {
      expect(r.appliedByPlayerId).toBe('firewall-b');
      expect(r.expiresAt).toBe(Phase.NIGHT_REVEAL);
    }
  });

  it('does not collide across different scopes', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.locked('global', 'a', Phase.DAY_RESOLVE, NOW));
    applyRestriction(session, RestrictionBuilders.locked('hacker', 'a', Phase.DAY_RESOLVE, NOW));
    expect(session.restrictions).toHaveLength(2);
  });

  it('JAMMED and SILENCED on the same player do not collide', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.silenced('sender', 'a', Phase.DAY_RESOLVE, NOW));
    applyRestriction(session, RestrictionBuilders.jammed('sender', [ChannelType.GLOBAL], 'b', Phase.DAY_RESOLVE, NOW));
    expect(session.restrictions).toHaveLength(2);
  });

  it('LOCKED restriction also flips channel.locked mirror to true', () => {
    // The `channel.locked` boolean is a derived mirror of the restrictions
    // list. applyRestriction must keep the mirror in sync so projections and
    // send-pipeline fast-paths don't have to scan restrictions themselves.
    const session = emptySession();
    session.channels['global'] = channel('global', ChannelType.GLOBAL);
    expect(session.channels['global'].locked).toBe(false);

    applyRestriction(session, RestrictionBuilders.locked('global', 'fw', Phase.DAY_RESOLVE, NOW));

    expect(session.channels['global'].locked).toBe(true);
  });

  it('non-LOCKED restrictions do not affect any channel.locked mirror', () => {
    const session = emptySession();
    session.channels['global'] = channel('global', ChannelType.GLOBAL);

    applyRestriction(session, RestrictionBuilders.silenced('sender', 'a', Phase.DAY_RESOLVE, NOW));

    expect(session.channels['global'].locked).toBe(false);
  });
});

describe('evaluateOutboundMessage', () => {
  it('ALLOW when no restrictions match', () => {
    const session = emptySession();
    const decision = evaluateOutboundMessage(session, 'sender', channel('global', ChannelType.GLOBAL), 'hi', Phase.DAY_OPEN);
    expect(decision.kind).toBe('ALLOW');
  });

  it('PM_PHASE_RESTRICTED rejects PRIVATE channel sends outside DAY_OPEN', () => {
    const session = emptySession();
    const decision = evaluateOutboundMessage(
      session,
      'sender',
      channel('dm-x-y', ChannelType.PRIVATE),
      'hi',
      Phase.DAY_VOTE,
    );
    expect(decision).toMatchObject({ kind: 'REJECT', code: MessageErrorCode.PM_PHASE_RESTRICTED });
  });

  it('PM_PHASE_RESTRICTED does not fire on non-PRIVATE channels outside DAY_OPEN', () => {
    const session = emptySession();
    const decision = evaluateOutboundMessage(
      session,
      'sender',
      channel('global', ChannelType.GLOBAL),
      'hi',
      Phase.DAY_VOTE,
    );
    expect(decision.kind).toBe('ALLOW');
  });

  it('LOCKED rejects with CHANNEL_LOCKED for matching channelId', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.locked('global', 'fw', Phase.DAY_RESOLVE, NOW));
    const decision = evaluateOutboundMessage(session, 'sender', channel('global', ChannelType.GLOBAL), 'hi', Phase.DAY_OPEN);
    expect(decision).toEqual({
      kind: 'REJECT',
      code: MessageErrorCode.CHANNEL_LOCKED,
      message: expect.any(String),
    });
  });

  it('LOCKED on a different channel does not reject', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.locked('hacker', 'fw', Phase.DAY_RESOLVE, NOW));
    const decision = evaluateOutboundMessage(session, 'sender', channel('global', ChannelType.GLOBAL), 'hi', Phase.DAY_OPEN);
    expect(decision.kind).toBe('ALLOW');
  });

  it('SILENCED rejects with PLAYER_SILENCED', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.silenced('sender', 'imitator', Phase.DAY_RESOLVE, NOW));
    const decision = evaluateOutboundMessage(session, 'sender', channel('global', ChannelType.GLOBAL), 'hi', Phase.DAY_OPEN);
    expect(decision).toMatchObject({ kind: 'REJECT', code: MessageErrorCode.PLAYER_SILENCED });
  });

  it('JAMMED rejects only when channel.type is in channelTypes', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.jammed('sender', [ChannelType.PRIVATE], 'sj', Phase.DAY_RESOLVE, NOW));
    const onPrivate = evaluateOutboundMessage(session, 'sender', channel('dm-x-y', ChannelType.PRIVATE), 'hi', Phase.DAY_OPEN);
    const onGlobal = evaluateOutboundMessage(session, 'sender', channel('global', ChannelType.GLOBAL), 'hi', Phase.DAY_OPEN);
    expect(onPrivate).toMatchObject({ kind: 'REJECT', code: MessageErrorCode.PLAYER_JAMMED });
    expect(onGlobal.kind).toBe('ALLOW');
  });

  it('decision order: PM_PHASE beats LOCKED beats SILENCED beats JAMMED', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.silenced('sender', 'a', Phase.DAY_RESOLVE, NOW));
    applyRestriction(session, RestrictionBuilders.jammed('sender', [ChannelType.PRIVATE], 'b', Phase.DAY_RESOLVE, NOW));
    applyRestriction(session, RestrictionBuilders.locked('dm', 'c', Phase.DAY_RESOLVE, NOW));
    // PRIVATE channel + non-DAY_OPEN phase → PM_PHASE_RESTRICTED wins over LOCKED/SILENCED/JAMMED.
    const restricted = evaluateOutboundMessage(session, 'sender', channel('dm', ChannelType.PRIVATE), 'hi', Phase.DAY_VOTE);
    expect(restricted).toMatchObject({ kind: 'REJECT', code: MessageErrorCode.PM_PHASE_RESTRICTED });
    // Same session, DAY_OPEN → LOCKED wins over SILENCED/JAMMED.
    const open = evaluateOutboundMessage(session, 'sender', channel('dm', ChannelType.PRIVATE), 'hi', Phase.DAY_OPEN);
    expect(open).toMatchObject({ kind: 'REJECT', code: MessageErrorCode.CHANNEL_LOCKED });
  });

  it('MONITORED adds the observer to extraRecipients', () => {
    const session = emptySession();
    applyRestriction(
      session,
      RestrictionBuilders.monitored('sender', 'obs', [ChannelType.PRIVATE], 'eaves', Phase.DAY_RESOLVE, NOW),
    );
    const decision = evaluateOutboundMessage(session, 'sender', channel('dm', ChannelType.PRIVATE), 'hi', Phase.DAY_OPEN);
    expect(decision.kind).toBe('TRANSFORM');
    if (decision.kind === 'TRANSFORM') {
      expect(decision.content).toBe('hi');
      expect(decision.extraRecipients).toEqual(['obs']);
    }
  });

  it('ALTERED REPLACE rewrites content; oneShot flips spent only after consume()', () => {
    const session = emptySession();
    applyRestriction(
      session,
      RestrictionBuilders.altered(
        'sender',
        [ChannelType.PRIVATE],
        'REPLACE',
        true,
        'troller',
        Phase.DAY_RESOLVE,
        NOW,
        'you have been had',
      ),
    );
    const first = evaluateOutboundMessage(session, 'sender', channel('dm', ChannelType.PRIVATE), 'hi', Phase.DAY_OPEN);
    expect(first.kind).toBe('TRANSFORM');
    if (first.kind === 'TRANSFORM') {
      expect(first.content).toBe('you have been had');
      // Evaluate-without-consume must NOT burn the shot — proves consume() is the
      // commit point, not evaluate(). Re-evaluate and confirm the altered copy still fires.
      const replay = evaluateOutboundMessage(session, 'sender', channel('dm', ChannelType.PRIVATE), 'hi again', Phase.DAY_OPEN);
      expect(replay.kind).toBe('TRANSFORM');
      // Commit the first decision's side effect.
      first.consume();
    }

    const second = evaluateOutboundMessage(session, 'sender', channel('dm', ChannelType.PRIVATE), 'hi again', Phase.DAY_OPEN);
    expect(second.kind).toBe('ALLOW');
  });

  it('ALTERED SCRAMBLE transforms content via exported scramble() and carries no extraRecipients', () => {
    const session = emptySession();
    applyRestriction(
      session,
      RestrictionBuilders.altered(
        'sender',
        [ChannelType.PRIVATE],
        'SCRAMBLE',
        false,
        'troller',
        Phase.DAY_RESOLVE,
        NOW,
      ),
    );
    const decision = evaluateOutboundMessage(session, 'sender', channel('dm', ChannelType.PRIVATE), 'hello', Phase.DAY_OPEN);
    expect(decision.kind).toBe('TRANSFORM');
    if (decision.kind === 'TRANSFORM') {
      // Share the reference with production code — Troller (#88) replaces scramble()
      // and this test moves with it.
      expect(decision.content).toBe(scramble('hello'));
      // No MONITORED restriction in this fixture — extraRecipients must be empty,
      // so the sender-only / members split in the handler stays deterministic.
      expect(decision.extraRecipients).toEqual([]);
    }
  });

  it('ALTERED + MONITORED combine into one TRANSFORM with both effects', () => {
    const session = emptySession();
    applyRestriction(
      session,
      RestrictionBuilders.monitored('sender', 'obs', [ChannelType.PRIVATE], 'eaves', Phase.DAY_RESOLVE, NOW),
    );
    applyRestriction(
      session,
      RestrictionBuilders.altered('sender', [ChannelType.PRIVATE], 'SCRAMBLE', false, 'troller', Phase.DAY_RESOLVE, NOW),
    );
    const decision = evaluateOutboundMessage(session, 'sender', channel('dm', ChannelType.PRIVATE), 'hi', Phase.DAY_OPEN);
    expect(decision.kind).toBe('TRANSFORM');
    if (decision.kind === 'TRANSFORM') {
      expect(decision.content).toBe(scramble('hi'));
      expect(decision.extraRecipients).toEqual(['obs']);
    }
  });
});

describe('clearExpiredRestrictions', () => {
  it('removes restrictions whose expiresAt equals the previous phase', () => {
    const session = emptySession();
    applyRestriction(session, RestrictionBuilders.silenced('sender', 'a', Phase.DAY_RESOLVE, NOW));
    applyRestriction(session, RestrictionBuilders.silenced('obs', 'a', Phase.NIGHT_REVEAL, NOW));
    clearExpiredRestrictions(session, Phase.DAY_RESOLVE);
    expect(session.restrictions).toHaveLength(1);
    expect((session.restrictions![0] as any).playerId).toBe('obs');
  });

  it('re-derives channel.locked from active LOCKED restrictions', () => {
    const session = emptySession();
    session.channels['global'] = channel('global', ChannelType.GLOBAL);
    applyRestriction(session, RestrictionBuilders.locked('global', 'fw', Phase.DAY_RESOLVE, NOW));
    // applyRestriction already set channel.locked=true via the mirror invariant.
    expect(session.channels['global'].locked).toBe(true);
    clearExpiredRestrictions(session, Phase.DAY_RESOLVE);
    // LOCKED expired → channel.locked flips back to false
    expect(session.channels['global'].locked).toBe(false);
  });

  it('deletes channels whose expiresAt equals the previous phase', () => {
    const session = emptySession();
    session.channels['temp-x'] = { id: 'temp-x', type: ChannelType.TEMP, members: [], locked: false, expiresAt: Phase.DAY_RESOLVE };
    session.channels['global'] = channel('global', ChannelType.GLOBAL);
    clearExpiredRestrictions(session, Phase.DAY_RESOLVE);
    expect(session.channels['temp-x']).toBeUndefined();
    expect(session.channels['global']).toBeDefined();
  });
});
