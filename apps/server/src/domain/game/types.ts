import type {
  ChannelType,
  IntentType,
  NightActionType,
  Phase,
  RestrictionType,
  SessionStatus,
  SystemEventMetadata,
  SystemEventType,
  Team,
} from '@tattletale/shared';

export interface PlayerState {
  playerId: string;
  displayName: string;
  alive: boolean;
  connected: boolean;
  roleId: string | null;
  team: Team;
  permissions: string[];
  /**
   * Once-per-game flag for FIREWALL's CHANNEL_LOCK. Set the first time the
   * Firewall successfully locks a channel; subsequent submissions are
   * rejected at validation time. Optional for backward compat with sessions
   * persisted before #84.
   */
  firewallUsed?: boolean;
}

export interface ChannelState {
  id: string;
  type: ChannelType;
  members: string[];
  locked: boolean;
  expiresAt: Phase | null;
}

export interface PlayerIntent {
  id: string;
  playerId: string;
  type: IntentType.SUBMIT_VOTE | IntentType.SUBMIT_NIGHT_ACTION;
  payload: VoteIntentPayload | NightActionIntentPayload;
  cycle: number;
  phase: Phase;
  createdAt: string;
}

export interface VoteIntentPayload {
  targetPlayerId: string | null;
}

export interface NightActionIntentPayload {
  actionType: NightActionType;
  targetPlayerId: string | null;
  targetChannelId?: string;
  metadata: Record<string, unknown>;
}

export interface SystemEventState {
  id: string;
  type: SystemEventType;
  createdAt: string;
  metadata: SystemEventMetadata;
}

/**
 * A communication restriction applied during Night Resolution and enforced
 * until its `expiresAt` phase transitions out. See
 * apps/server/src/domain/game/restrictions.ts for builders and the
 * `evaluateOutboundMessage` / `clearExpiredRestrictions` helpers.
 *
 * Invariant: a restriction is "active" during every phase from `appliedAt`
 * up to and including `expiresAt`. `clearExpiredRestrictions` removes it
 * when the session transitions *out of* `expiresAt`.
 */
export type Restriction =
  | {
      type: RestrictionType.LOCKED;
      channelId: string;
      appliedAt: string;
      expiresAt: Phase;
      appliedByPlayerId: string;
    }
  | {
      type: RestrictionType.SILENCED;
      playerId: string;
      appliedAt: string;
      expiresAt: Phase;
      appliedByPlayerId: string;
    }
  | {
      type: RestrictionType.JAMMED;
      playerId: string;
      channelTypes: ChannelType[];
      appliedAt: string;
      expiresAt: Phase;
      appliedByPlayerId: string;
    }
  | {
      type: RestrictionType.MONITORED;
      targetPlayerId: string;
      observerPlayerId: string;
      channelTypes: ChannelType[];
      appliedAt: string;
      expiresAt: Phase;
      appliedByPlayerId: string;
    }
  | {
      type: RestrictionType.ALTERED;
      targetPlayerId: string;
      channelTypes: ChannelType[];
      mode: 'SCRAMBLE' | 'REPLACE';
      // For REPLACE mode: the content that overrides the sender's message.
      // For SCRAMBLE mode: the role's scramble function produces the output; this stays undefined.
      payload?: string;
      // When true, the restriction fires once and then sets `spent=true`.
      // Troller's "first PM only" uses this.
      oneShot: boolean;
      spent: boolean;
      appliedAt: string;
      expiresAt: Phase;
      appliedByPlayerId: string;
    };

export interface GameTimersState {
  currentPhaseEndsAt: string | null;
  currentPhaseDurationSeconds: number;
}

export interface GameState {
  gameId: string;
  lobbyCode: string;
  status: SessionStatus;
  winnerTeam: Team | null;
  phase: Phase;
  cycle: number;
  players: Record<string, PlayerState>;
  channels: Record<string, ChannelState>;
  pendingIntents: PlayerIntent[];
  systemEvents: SystemEventState[];
  /**
   * Per-player private events (e.g., INVESTIGATION_RESULT) that must not be
   * visible to other players. Projected only into the matching player's view.
   * Optional for backward compatibility with pre-existing persisted sessions.
   */
  privateSystemEvents?: Record<string, SystemEventState[]>;
  /**
   * Active communication restrictions (see `Restriction` union above).
   * Optional for backward compatibility with sessions persisted before the
   * Communication Restriction Framework (#76) landed; readers must treat
   * `undefined` as `[]` and writers should lazy-init before appending.
   */
  restrictions?: Restriction[];
  timers: GameTimersState;
  createdAt: string;
  updatedAt: string;
}
