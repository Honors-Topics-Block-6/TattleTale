import { SystemEventType, Team, type SystemEventMetadata } from '@tattletale/shared';

/**
 * Builders for SystemEventMetadata. Single source of truth for what fields
 * each event carries. Always go through these — never construct metadata literals
 * inline in domain code.
 */
export const SystemEventMetadataBuilders = {
  playerVotedOut(targetPlayerId: string, targetDisplayName: string): SystemEventMetadata {
    return { type: 'PLAYER_VOTED_OUT', targetPlayerId, targetDisplayName };
  },
  playerKilledAtNight(targetPlayerId: string, targetDisplayName: string): SystemEventMetadata {
    return { type: 'PLAYER_KILLED_AT_NIGHT', targetPlayerId, targetDisplayName };
  },
  noKillTonight(): SystemEventMetadata {
    return { type: 'NO_KILL_TONIGHT' };
  },
  gameStarted(): SystemEventMetadata {
    return { type: 'GAME_STARTED' };
  },
  channelLocked(channelId: string): SystemEventMetadata {
    return { type: 'CHANNEL_LOCKED', channelId };
  },
  communicationJammed(): SystemEventMetadata {
    return { type: 'COMMUNICATION_JAMMED' };
  },
  messageIntegrityCompromised(): SystemEventMetadata {
    return { type: 'MESSAGE_INTEGRITY_COMPROMISED' };
  },
  tempChannelCreated(channelId: string): SystemEventMetadata {
    return { type: 'TEMP_CHANNEL_CREATED', channelId };
  },
  psychicSignalReceived(): SystemEventMetadata {
    return { type: 'PSYCHIC_SIGNAL_RECEIVED' };
  },
  investigationResult(
    targetPlayerId: string,
    targetDisplayName: string,
    targetRoleId: string | null,
    targetTeam: Team,
  ): SystemEventMetadata {
    return { type: 'INVESTIGATION_RESULT', targetPlayerId, targetDisplayName, targetRoleId, targetTeam };
  },
  nightKillProtected(targetPlayerId: string, targetDisplayName: string): SystemEventMetadata {
    return { type: 'NIGHT_KILL_PROTECTED', targetPlayerId, targetDisplayName };
  },
};

/** Compile-time guarantee: every SystemEventType value has a corresponding builder. */
type _BuilderCoverage = SystemEventType extends keyof typeof SystemEventMetadataBuilders
  | 'PLAYER_VOTED_OUT' | 'PLAYER_KILLED_AT_NIGHT' | 'NO_KILL_TONIGHT' | 'GAME_STARTED'
  | 'CHANNEL_LOCKED' | 'COMMUNICATION_JAMMED' | 'MESSAGE_INTEGRITY_COMPROMISED'
  | 'TEMP_CHANNEL_CREATED' | 'PSYCHIC_SIGNAL_RECEIVED'
  | 'INVESTIGATION_RESULT' | 'NIGHT_KILL_PROTECTED'
  ? true : never;
