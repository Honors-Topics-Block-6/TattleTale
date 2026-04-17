import type {
  ChannelType,
  IntentType,
  NightActionType,
  Phase,
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
  timers: GameTimersState;
  createdAt: string;
  updatedAt: string;
}
