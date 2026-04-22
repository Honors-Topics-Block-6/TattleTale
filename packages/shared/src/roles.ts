import { RoleId, Team } from './enums.js';

export interface RoleDefinition {
  id: RoleId;
  team: Team;
  displayName: string;
  isBase: boolean;
  unique: boolean;
  minPlayers: number;
}

export const ROLE_DEFINITIONS: ReadonlyMap<RoleId, RoleDefinition> = new Map([
  [RoleId.FRIEND, { id: RoleId.FRIEND, team: Team.FRIENDS, displayName: 'Friend', isBase: true, unique: false, minPlayers: 0 }],
  [RoleId.EXTROVERT, { id: RoleId.EXTROVERT, team: Team.FRIENDS, displayName: 'Extrovert', isBase: false, unique: true, minPlayers: 7 }],
  [RoleId.WHITE_HAT_HACKER, { id: RoleId.WHITE_HAT_HACKER, team: Team.FRIENDS, displayName: 'White Hat Hacker', isBase: false, unique: true, minPlayers: 7 }],
  [RoleId.SECURITY_SPECIALIST, { id: RoleId.SECURITY_SPECIALIST, team: Team.FRIENDS, displayName: 'Security Specialist', isBase: false, unique: true, minPlayers: 7 }],
  [RoleId.HACKER, { id: RoleId.HACKER, team: Team.HACKERS, displayName: 'Hacker', isBase: true, unique: false, minPlayers: 0 }],
  [RoleId.THE_BOSS, { id: RoleId.THE_BOSS, team: Team.HACKERS, displayName: 'The Boss', isBase: false, unique: true, minPlayers: 7 }],
  [RoleId.SIGNAL_JAMMER, { id: RoleId.SIGNAL_JAMMER, team: Team.HACKERS, displayName: 'Signal Jammer', isBase: false, unique: true, minPlayers: 9 }],
  [RoleId.EAVESDROPPER, { id: RoleId.EAVESDROPPER, team: Team.HACKERS, displayName: 'Eavesdropper', isBase: false, unique: true, minPlayers: 9 }],
  [RoleId.TROLLER, { id: RoleId.TROLLER, team: Team.HACKERS, displayName: 'Troller', isBase: false, unique: true, minPlayers: 11 }],
  [RoleId.IMITATOR, { id: RoleId.IMITATOR, team: Team.HACKERS, displayName: 'Imitator', isBase: false, unique: true, minPlayers: 11 }],
]);
