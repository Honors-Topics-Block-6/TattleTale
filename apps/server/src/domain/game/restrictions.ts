import {
  ChannelType,
  MessageErrorCode,
  Phase,
  RestrictionType,
} from '@tattletale/shared';

import type { ChannelState, GameState, Restriction } from './types.js';

/**
 * Builders for the `Restriction` discriminated union.
 *
 * Callers (night-action resolvers, test fixtures) MUST go through these
 * rather than constructing literals inline. The compile-time coverage check
 * at the bottom of the file guarantees that every `RestrictionType` value
 * has a matching builder — add a type, break the build, get a reminder.
 *
 * Same pattern as `SystemEventMetadataBuilders` in `./system-events.ts`.
 */
export const RestrictionBuilders = {
  locked(
    channelId: string,
    appliedByPlayerId: string,
    expiresAt: Phase,
    now: string,
  ): Restriction {
    return {
      type: RestrictionType.LOCKED,
      channelId,
      appliedAt: now,
      expiresAt,
      appliedByPlayerId,
    };
  },
  silenced(
    playerId: string,
    appliedByPlayerId: string,
    expiresAt: Phase,
    now: string,
  ): Restriction {
    return {
      type: RestrictionType.SILENCED,
      playerId,
      appliedAt: now,
      expiresAt,
      appliedByPlayerId,
    };
  },
  jammed(
    playerId: string,
    channelTypes: ChannelType[],
    appliedByPlayerId: string,
    expiresAt: Phase,
    now: string,
  ): Restriction {
    return {
      type: RestrictionType.JAMMED,
      playerId,
      channelTypes: [...channelTypes],
      appliedAt: now,
      expiresAt,
      appliedByPlayerId,
    };
  },
  monitored(
    targetPlayerId: string,
    observerPlayerId: string,
    channelTypes: ChannelType[],
    appliedByPlayerId: string,
    expiresAt: Phase,
    now: string,
  ): Restriction {
    return {
      type: RestrictionType.MONITORED,
      targetPlayerId,
      observerPlayerId,
      channelTypes: [...channelTypes],
      appliedAt: now,
      expiresAt,
      appliedByPlayerId,
    };
  },
  altered(
    targetPlayerId: string,
    channelTypes: ChannelType[],
    mode: 'SCRAMBLE' | 'REPLACE',
    oneShot: boolean,
    appliedByPlayerId: string,
    expiresAt: Phase,
    now: string,
    payload?: string,
  ): Restriction {
    return {
      type: RestrictionType.ALTERED,
      targetPlayerId,
      channelTypes: [...channelTypes],
      mode,
      oneShot,
      spent: false,
      payload,
      appliedAt: now,
      expiresAt,
      appliedByPlayerId,
    };
  },
};

/**
 * Re-derive `channel.locked` from the active restrictions list. Keeps the
 * mirror in sync whenever a LOCKED restriction is added or removed; projections
 * and client fast-paths can keep reading the boolean without scanning
 * `session.restrictions`.
 */
function recomputeChannelLock(session: GameState, channelId: string): void {
  const channel = session.channels[channelId];
  if (!channel) return;
  channel.locked = (session.restrictions ?? []).some(
    (r) => r.type === RestrictionType.LOCKED && r.channelId === channelId,
  );
}

/**
 * Append a restriction, deduplicating by (type, scope). If an active
 * restriction of the same type with the same primary scope already exists
 * it is replaced — so a second Firewall lock on the same channel refreshes
 * the expiry rather than stacking two entries. Same overwrite-on-duplicate
 * semantic as `appendIntent` for SUBMIT_NIGHT_ACTION.
 *
 * "Scope" is defined per type:
 *   LOCKED    → channelId
 *   SILENCED  → playerId
 *   JAMMED    → playerId
 *   MONITORED → (targetPlayerId, observerPlayerId)
 *   ALTERED   → targetPlayerId
 *
 * For LOCKED restrictions the `channel.locked` mirror is updated in the same
 * operation so callers never have to remember to toggle the boolean — the
 * restrictions list remains the single source of truth.
 */
export function applyRestriction(session: GameState, restriction: Restriction): void {
  if (!session.restrictions) session.restrictions = [];

  const keep = session.restrictions.filter((r) => !sameScope(r, restriction));
  keep.push(restriction);
  session.restrictions = keep;

  if (restriction.type === RestrictionType.LOCKED) {
    recomputeChannelLock(session, restriction.channelId);
  }
}

function sameScope(a: Restriction, b: Restriction): boolean {
  if (a.type !== b.type) return false;
  // The `a.type !== b.type` guard above proves `b` has the same discriminant
  // as `a`; the `b as typeof a` casts below are narrowing, not unsafe —
  // TypeScript just doesn't propagate the guard through the switch.
  switch (a.type) {
    case RestrictionType.LOCKED:
      return a.channelId === (b as typeof a).channelId;
    case RestrictionType.SILENCED:
      return a.playerId === (b as typeof a).playerId;
    case RestrictionType.JAMMED:
      return a.playerId === (b as typeof a).playerId;
    case RestrictionType.MONITORED:
      return (
        a.targetPlayerId === (b as typeof a).targetPlayerId
        && a.observerPlayerId === (b as typeof a).observerPlayerId
      );
    case RestrictionType.ALTERED:
      return a.targetPlayerId === (b as typeof a).targetPlayerId;
  }
}

/**
 * Outcome of evaluating an outbound message against active restrictions.
 *
 * - `ALLOW`: no restriction alters the message; broadcast as-is to
 *   `channel.members`.
 * - `REJECT`: send is refused; the caller returns the error code.
 * - `TRANSFORM`: message is delivered with possibly-altered content and/or
 *   extra recipients. The caller is responsible for the split-broadcast
 *   (sender sees original, recipients see transformed) and MUST call
 *   `consume()` once the message is committed to the broadcast path so
 *   oneShot ALTERED restrictions are marked spent exactly when they fire.
 */
export type OutboundDecision =
  | { kind: 'ALLOW' }
  | { kind: 'REJECT'; code: MessageErrorCode; message: string }
  | { kind: 'TRANSFORM'; content: string; extraRecipients: string[]; consume: () => void };

/**
 * Decide what to do with an outbound message.
 *
 * Order (defense-in-depth layering mirroring ws-message-handler.ts:
 * SYSTEM > HACKER > membership > PRIVATE-phase > CHANNEL_LOCKED):
 *   0. PRIVATE + phase ≠ DAY_OPEN → REJECT(PM_PHASE_RESTRICTED)
 *   1. LOCKED    on channel       → REJECT(CHANNEL_LOCKED)
 *   2. SILENCED  on sender        → REJECT(PLAYER_SILENCED)
 *   3. JAMMED    on sender+type   → REJECT(PLAYER_JAMMED)
 *   4. MONITORED on sender+type   → add observers to extraRecipients
 *   5. ALTERED   on sender+type   → transform content (consume() marks spent if oneShot)
 *   6. otherwise                  → ALLOW
 *
 * MONITORED + ALTERED combine into a single TRANSFORM so the send pipeline
 * only needs one branch for "anything that mutates delivery."
 *
 * The scramble algorithm for SCRAMBLE mode is role-owned (Troller in #88
 * picks the specific transformation). For the framework PR it reverses the
 * content as a placeholder — roles will replace the implementation via the
 * exported `scramble` function so tests and production share one reference.
 */
export function evaluateOutboundMessage(
  session: GameState,
  senderId: string,
  channel: ChannelState,
  content: string,
  phase: Phase,
): OutboundDecision {
  if (channel.type === ChannelType.PRIVATE && phase !== Phase.DAY_OPEN) {
    return {
      kind: 'REJECT',
      code: MessageErrorCode.PM_PHASE_RESTRICTED,
      message: 'Private messages are only allowed during the day discussion phase.',
    };
  }

  const restrictions = session.restrictions ?? [];

  // Single pass: collect the highest-priority rejection (LOCKED > SILENCED >
  // JAMMED) AND the TRANSFORM inputs (MONITORED extraRecipients, first matching
  // ALTERED). If a rejection wins, the TRANSFORM state is discarded. Priority
  // is encoded as a number so later matches can only overwrite if stricter.
  const REJECT_PRIORITY = { LOCKED: 1, SILENCED: 2, JAMMED: 3 } as const;
  let rejection:
    | { priority: number; code: MessageErrorCode; message: string }
    | null = null;
  const extraRecipients: string[] = [];
  let transformedContent: string | null = null;
  let alteredMatch: Extract<Restriction, { type: RestrictionType.ALTERED }> | null = null;

  for (const r of restrictions) {
    switch (r.type) {
      case RestrictionType.LOCKED:
        if (
          r.channelId === channel.id
          && (!rejection || rejection.priority > REJECT_PRIORITY.LOCKED)
        ) {
          rejection = {
            priority: REJECT_PRIORITY.LOCKED,
            code: MessageErrorCode.CHANNEL_LOCKED,
            message: 'This channel is locked.',
          };
        }
        break;
      case RestrictionType.SILENCED:
        if (
          r.playerId === senderId
          && (!rejection || rejection.priority > REJECT_PRIORITY.SILENCED)
        ) {
          rejection = {
            priority: REJECT_PRIORITY.SILENCED,
            code: MessageErrorCode.PLAYER_SILENCED,
            message: 'You have been silenced and cannot send messages.',
          };
        }
        break;
      case RestrictionType.JAMMED:
        if (
          r.playerId === senderId
          && r.channelTypes.includes(channel.type)
          && (!rejection || rejection.priority > REJECT_PRIORITY.JAMMED)
        ) {
          rejection = {
            priority: REJECT_PRIORITY.JAMMED,
            code: MessageErrorCode.PLAYER_JAMMED,
            message: 'Your signal is jammed on this channel.',
          };
        }
        break;
      case RestrictionType.MONITORED:
        if (
          r.targetPlayerId === senderId
          && r.channelTypes.includes(channel.type)
          && !extraRecipients.includes(r.observerPlayerId)
        ) {
          extraRecipients.push(r.observerPlayerId);
        }
        break;
      case RestrictionType.ALTERED:
        if (
          !alteredMatch
          && r.targetPlayerId === senderId
          && r.channelTypes.includes(channel.type)
          && !r.spent
        ) {
          transformedContent = r.mode === 'REPLACE' && r.payload !== undefined
            ? r.payload
            : scramble(content);
          alteredMatch = r;
        }
        break;
    }
  }

  if (rejection) {
    return { kind: 'REJECT', code: rejection.code, message: rejection.message };
  }

  if (transformedContent !== null || extraRecipients.length > 0) {
    return {
      kind: 'TRANSFORM',
      content: transformedContent ?? content,
      extraRecipients,
      consume: () => {
        if (alteredMatch && alteredMatch.oneShot) {
          alteredMatch.spent = true;
        }
      },
    };
  }

  return { kind: 'ALLOW' };
}

/**
 * Placeholder scramble — reverses the message. Troller (#88) will replace
 * this with a convincing transformation (word scramble, name swap). Exported
 * so tests and the eventual role implementation share one reference; update
 * all call sites together when #88 lands.
 *
 * NOTE: the placeholder iterates UTF-16 code units, so surrogate pairs
 * (emoji, non-BMP) and combining marks will mangle. The real Troller
 * transform in #88 must operate on grapheme clusters (e.g. `Intl.Segmenter`)
 * to preserve user-visible glyphs.
 *
 * TODO(#88): Replace with the Troller-specific transform. All tests that
 * assert against the exact output (currently reversed strings) must move in
 * lockstep.
 */
export function scramble(content: string): string {
  return content.split('').reverse().join('');
}

/**
 * Phase-transition cleanup. Called from `reconcileSessionRuntime` after
 * the current phase's work has resolved and before the session advances to
 * the next phase. Removes any restriction whose `expiresAt` matches the
 * phase we are transitioning *out of*.
 *
 * Also:
 *   - Deletes channels whose `channel.expiresAt` matches `previousPhase`
 *     (fixes a pre-existing bug where TEMP channels set at runtime-domain.ts
 *     line 420 never got cleaned up).
 *   - Re-derives `channel.locked` for every remaining channel: a channel is
 *     locked iff at least one active LOCKED restriction targets it. This
 *     lets migrated Firewall locks auto-reopen at expiry without projection
 *     code needing to know about the restrictions list.
 */
export function clearExpiredRestrictions(session: GameState, previousPhase: Phase): void {
  const restrictions = session.restrictions ?? [];
  session.restrictions = restrictions.filter((r) => r.expiresAt !== previousPhase);

  for (const [channelId, channel] of Object.entries(session.channels)) {
    if (channel.expiresAt === previousPhase) {
      delete session.channels[channelId];
    }
  }

  for (const channel of Object.values(session.channels)) {
    channel.locked = session.restrictions.some(
      (r) => r.type === RestrictionType.LOCKED && r.channelId === channel.id,
    );
  }
}

/**
 * Compile-time guarantee: every RestrictionType has a matching builder.
 * Adding a new RestrictionType without a builder makes `Exclude<...>` non-`never`,
 * which narrows the guard type to `never` and fails the `const ... = true` assignment.
 */
type _BuilderCoverage =
  Exclude<RestrictionType, keyof typeof RestrictionBuilders> extends never ? true : never;
const _coverageGuard: _BuilderCoverage = true;
void _coverageGuard;
