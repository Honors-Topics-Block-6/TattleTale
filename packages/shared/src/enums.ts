export enum Phase {
  DAY_OPEN = 'DAY_OPEN',
  DAY_VOTE = 'DAY_VOTE',
  DAY_RESOLVE = 'DAY_RESOLVE',
  NIGHT_ACTIONS = 'NIGHT_ACTIONS',
  NIGHT_RESOLVE = 'NIGHT_RESOLVE',
  NIGHT_REVEAL = 'NIGHT_REVEAL',
}

export enum ChannelType {
  GLOBAL = 'GLOBAL',
  PRIVATE = 'PRIVATE',
  ROLE = 'ROLE',
  TEMP = 'TEMP',
  SYSTEM = 'SYSTEM',
  HACKER = 'HACKER',
}

export enum IntentType {
  SEND_MESSAGE = 'SEND_MESSAGE',
  SUBMIT_VOTE = 'SUBMIT_VOTE',
  SUBMIT_NIGHT_ACTION = 'SUBMIT_NIGHT_ACTION',
}

export enum NightActionType {
  HACKER_KILL = 'HACKER_KILL',
  PROTECT = 'PROTECT',
  INVESTIGATE = 'INVESTIGATE',
  MONITOR = 'MONITOR',
  JAM = 'JAM',
  MISDIRECT = 'MISDIRECT',
  IMITATE = 'IMITATE',
  CREATE_TEMP_CHAT = 'CREATE_TEMP_CHAT',
  CHANNEL_LOCK = 'CHANNEL_LOCK',
  SWAP_ROLE = 'SWAP_ROLE',
  VENGEFUL_KILL = 'VENGEFUL_KILL',
}

export enum SystemEventType {
  CHANNEL_LOCKED = 'CHANNEL_LOCKED',
  COMMUNICATION_JAMMED = 'COMMUNICATION_JAMMED',
  MESSAGE_INTEGRITY_COMPROMISED = 'MESSAGE_INTEGRITY_COMPROMISED',
  TEMP_CHANNEL_CREATED = 'TEMP_CHANNEL_CREATED',
  PSYCHIC_SIGNAL_RECEIVED = 'PSYCHIC_SIGNAL_RECEIVED',
  GAME_STARTED = 'GAME_STARTED',
  PLAYER_VOTED_OUT = 'PLAYER_VOTED_OUT',
  PLAYER_KILLED_AT_NIGHT = 'PLAYER_KILLED_AT_NIGHT',
  NO_KILL_TONIGHT = 'NO_KILL_TONIGHT',
  INVESTIGATION_RESULT = 'INVESTIGATION_RESULT',
  NIGHT_KILL_PROTECTED = 'NIGHT_KILL_PROTECTED',
}

/**
 * Wire-level error codes returned in HandlerResult / CommandFailure payloads.
 * Defined here so server and client share a single source of truth and neither
 * side needs string literals or custom constants.
 *
 * Naming convention: SCREAMING_SNAKE, verb-free noun phrase describing the
 * rejection reason (matches existing codes in ws-message-handler.ts).
 */
export enum MessageErrorCode {
  /** Channel does not exist in the current session. */
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  /** Sender is not a member of the target channel. */
  NOT_CHANNEL_MEMBER = 'NOT_CHANNEL_MEMBER',
  /** Channel is locked (by a role ability or phase transition). */
  CHANNEL_LOCKED = 'CHANNEL_LOCKED',
  /**
   * SYSTEM channels are read-only — they carry game events (eliminations,
   * lock notices, investigation results) authored by the server. Players
   * must never post there, so SEND_MESSAGE on a SYSTEM channel is rejected
   * before any membership or lock checks.
   */
  SYSTEM_CHANNEL_READONLY = 'SYSTEM_CHANNEL_READONLY',
  /**
   * A PRIVATE (DM) channel cannot be used in the current game phase.
   * PMs are only allowed during DAY_OPEN. They are disabled during DAY_VOTE
   * (which collapses Final Statements + Voting from the design doc),
   * DAY_RESOLVE, and all night phases. Distinct from CHANNEL_LOCKED so
   * clients can surface a phase-specific message rather than a generic lock.
   */
  PM_PHASE_RESTRICTED = 'PM_PHASE_RESTRICTED',
  /** Message body is empty after trimming. */
  EMPTY_MESSAGE = 'EMPTY_MESSAGE',
  /** Message body exceeds the 500-character limit. */
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
}

export enum LobbyStatus {
  WAITING = 'WAITING',
  IN_GAME = 'IN_GAME',
  CLOSED = 'CLOSED',
}

export enum Team {
  FRIENDS = 'FRIENDS',
  HACKERS = 'HACKERS',
}

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  FRIENDS_WIN = 'FRIENDS_WIN',
  HACKERS_WIN = 'HACKERS_WIN',
}
