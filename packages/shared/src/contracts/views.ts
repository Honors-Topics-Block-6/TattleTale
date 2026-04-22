import type {
  ChannelType,
  IntentType,
  LobbyStatus,
  Phase,
  RestrictionType,
  SessionStatus,
  SystemEventType,
  Team,
} from '../enums.js';

export interface LobbySettingsView {
  minPlayers: number;
  maxPlayers: number;
  dayDurationSeconds: number;
  nightDurationSeconds: number;
}

export interface LobbyPlayerView {
  playerId: string;
  displayName: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  alive: boolean;
}

export interface LobbyView {
  code: string;
  status: LobbyStatus;
  hostPlayerId: string;
  players: LobbyPlayerView[];
  settings: LobbySettingsView;
  sessionId: string | null;
}

export interface SessionPlayerView {
  playerId: string;
  displayName: string;
  alive: boolean;
  connected: boolean;
}

export interface PlayerSessionPlayerView extends SessionPlayerView {
  role?: string;
  team?: Team;
}

export interface ChannelView {
  id: string;
  type: ChannelType;
  members: string[];
  locked: boolean;
  expiresAt: Phase | null;
  /**
   * Pre-computed display label for this channel.
   *
   * For PRIVATE channels the server sets this to the OTHER member's display
   * name (from the viewer's perspective), so clients do not need to
   * cross-reference `members` against the player list.
   *
   * For all other channel types this is `null`; clients fall back to their
   * own labelling logic (e.g. "Global", role name, etc.).
   */
  label: string | null;
}

/**
 * Per-type metadata for system events. Discriminated by SystemEventType value
 * (mirrored in the metadata `type` field for narrowing).
 * Keep in sync with apps/server/src/domain/game/system-events.ts builders.
 */
export type SystemEventMetadata =
  | { type: 'PLAYER_VOTED_OUT'; targetPlayerId: string; targetDisplayName: string }
  | { type: 'PLAYER_KILLED_AT_NIGHT'; targetPlayerId: string; targetDisplayName: string }
  | { type: 'NO_KILL_TONIGHT' }
  | { type: 'GAME_STARTED' }
  | { type: 'CHANNEL_LOCKED'; channelId: string }
  | { type: 'COMMUNICATION_JAMMED' }
  | { type: 'MESSAGE_INTEGRITY_COMPROMISED' }
  | { type: 'TEMP_CHANNEL_CREATED'; channelId: string }
  | { type: 'PSYCHIC_SIGNAL_RECEIVED' }
  | { type: 'INVESTIGATION_RESULT'; targetPlayerId: string; targetDisplayName: string; targetRoleId: string | null; targetTeam: Team }
  | { type: 'NIGHT_KILL_PROTECTED'; targetPlayerId: string; targetDisplayName: string };

export interface SystemEventView {
  id: string;
  type: SystemEventType;
  createdAt: string;
  /** Typed per-event metadata. The `type` field on metadata mirrors `type` above for client narrowing. */
  metadata: SystemEventMetadata;
}

export interface SessionView {
  gameId: string;
  lobbyCode: string;
  status: SessionStatus;
  phase: Phase;
  cycle: number;
  currentPhaseEndsAt: string | null;
  players: SessionPlayerView[];
  channels: ChannelView[];
  pendingIntentTypes: IntentType[];
  systemEvents: SystemEventView[];
}

export interface LobbyCommandSuccess {
  lobby: LobbyView;
  playerId: string;
  reconnectToken: string;
}

export interface StartGameSuccess {
  lobby: LobbyView;
  session: SessionView;
}

export interface SubmitIntentSuccess {
  acceptedIntentId: string;
  session: SessionView;
}

export interface SocketReadyPayload {
  lobbyCode: string | null;
  playerId: string | null;
  sessionId: string | null;
}

/**
 * Restriction information surfaced to a specific viewer. This is a *filtered*
 * subset of the server's full `Restriction` union — covert restrictions
 * (e.g. MONITORED, whose target must not know they are being watched) are
 * omitted from the viewer's bucket before projection, and attacker identity
 * (`appliedByPlayerId`) is never exposed regardless of type.
 *
 * Channel-type scope (`channelTypes`) is present for types whose behavior
 * depends on the active channel's type (JAMMED, ALTERED) so the client can
 * render a banner scoped to the right channels. LOCKED carries the affected
 * `channelId`. Other types carry only the restriction identity and lifecycle.
 */
export type ViewerRestriction =
  | { type: RestrictionType.LOCKED; channelId: string; expiresAt: Phase }
  | { type: RestrictionType.SILENCED; expiresAt: Phase }
  | { type: RestrictionType.JAMMED; channelTypes: ChannelType[]; expiresAt: Phase }
  | { type: RestrictionType.ALTERED; channelTypes: ChannelType[]; expiresAt: Phase };

export interface HackerNightView {
  /** Tally of HACKER_KILL targets for the current cycle. Empty object = no submissions yet. */
  tally: Record<string, number>;
  /** Viewer's own confirmed HACKER_KILL target for the current cycle, if submitted. */
  confirmedTarget: string | null;
}

export interface PlayerSessionView {
  gameId: string;
  lobbyCode: string;
  status: SessionStatus;
  phase: Phase;
  cycle: number;
  currentPhaseEndsAt: string | null;
  phaseDurationSeconds: number;
  players: PlayerSessionPlayerView[];
  channels: ChannelView[];
  myPendingIntentTypes: IntentType[];
  systemEvents: SystemEventView[];
  myRole: string;
  myTeam: Team;
  voteTally: Record<string, number> | null;
  /** Living Hackers other than the viewer. Always [] for non-Hackers and dead Hackers. Phase-independent. */
  myTeammates: string[];
  /**
   * Hacker-only night state. Non-null iff viewer is a living Hacker AND phase is NIGHT_ACTIONS.
   * Single discriminator — clients render NightPanel iff this is non-null. No other null/empty
   * branches in the contract carry hacker-night meaning.
   */
  hackerNightView: HackerNightView | null;
  /**
   * Active communication restrictions affecting this viewer. Covert
   * restrictions (MONITORED) are always omitted. Populated by the
   * projection layer from `session.restrictions`.
   */
  myRestrictions: ViewerRestriction[];
}
