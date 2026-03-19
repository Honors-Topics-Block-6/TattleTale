import type {
  ChannelType,
  IntentType,
  Phase,
  SystemEventType,
} from '@tattletale/shared';

export interface PlayerState {
  playerId: string;
  displayName: string;
  alive: boolean;
  connected: boolean;
  roleId: string | null;
  team: string | null;
  /** During night, non-hackers are asleep (no night actions / coordination). */
  sleeping: boolean;
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
  type: IntentType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SystemEventState {
  id: string;
  type: SystemEventType;
  createdAt: string;
}

export interface GameTimersState {
  currentPhaseEndsAt: string | null;
}

export interface GameState {
  gameId: string;
  lobbyCode: string;
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
