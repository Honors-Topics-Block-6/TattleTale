import type {
  ChannelType,
  IntentType,
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
  actionType: string;
  targetPlayerId: string | null;
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
  timers: GameTimersState;
  createdAt: string;
  updatedAt: string;
}
