import { NightActionType, Team } from '@tattletale/shared';

/**
 * Priority tier for each night action, per the design doc:
 *   1. Protection effects
 *   2. Information-gathering effects
 *   3. Communication interference effects
 *   4. Eliminations
 *   5. Chat creation or modification
 */
export const NIGHT_ACTION_TIER: Record<NightActionType, 1 | 2 | 3 | 4 | 5> = {
  [NightActionType.PROTECT]: 1,

  [NightActionType.INVESTIGATE]: 2,
  [NightActionType.MONITOR]: 2,

  [NightActionType.JAM]: 3,
  [NightActionType.MISDIRECT]: 3,
  [NightActionType.IMITATE]: 3,

  [NightActionType.HACKER_KILL]: 4,
  [NightActionType.VENGEFUL_KILL]: 4,

  [NightActionType.CREATE_TEMP_CHAT]: 5,
  [NightActionType.CHANNEL_LOCK]: 5,
  [NightActionType.SWAP_ROLE]: 5,
};

/**
 * Role → allowed night action types. A role absent from this map has no night action.
 * `roleId` values match the design-doc role identifiers (snake/pascal-case names from
 * apps/server/src/domain/game/roles once that module exists; for now, callers pass roleId
 * strings that correspond to these constants).
 *
 * This is the authoritative role→action contract on the server. It is intentionally NOT
 * exported to the shared package — clients should not learn other roles' abilities.
 */
export const ROLE_ACTION_MAP: Record<string, readonly NightActionType[]> = {
  SECURITY_SPECIALIST: [NightActionType.PROTECT],
  WHITE_HAT: [NightActionType.INVESTIGATE],
  EAVESDROPPER: [NightActionType.MONITOR],
  SIGNAL_JAMMER: [NightActionType.JAM],
  TROLLER: [NightActionType.MISDIRECT],
  IMITATOR: [NightActionType.IMITATE],
  HACKER: [NightActionType.HACKER_KILL],
  VENGEFUL: [NightActionType.VENGEFUL_KILL],
  EXTROVERT: [NightActionType.CREATE_TEMP_CHAT],
  FIREWALL: [NightActionType.CHANNEL_LOCK],
  JEALOUS: [NightActionType.SWAP_ROLE],
};

export interface RoleActionValidationContext {
  roleId: string | null;
  team: Team;
  actionType: NightActionType;
}

export type RoleActionValidationResult =
  | { allowed: true }
  | { allowed: false; reason: 'UNKNOWN_ROLE' | 'ROLE_CANNOT_SUBMIT_ACTION' };

/**
 * Validate that the given role may submit the given action. Until role assignment is
 * implemented, `roleId` is `null` for all players; in that case, fall back to team-based
 * validation so existing HACKER_KILL behavior continues to work (any Hacker can submit
 * HACKER_KILL). Once roles are assigned, this becomes strictly role-based.
 */
export function validateRoleAction({
  roleId,
  team,
  actionType,
}: RoleActionValidationContext): RoleActionValidationResult {
  if (roleId === null) {
    if (actionType === NightActionType.HACKER_KILL && team === Team.HACKERS) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'ROLE_CANNOT_SUBMIT_ACTION' };
  }

  const allowed = ROLE_ACTION_MAP[roleId];
  if (!allowed) {
    return { allowed: false, reason: 'UNKNOWN_ROLE' };
  }
  if (!allowed.includes(actionType)) {
    return { allowed: false, reason: 'ROLE_CANNOT_SUBMIT_ACTION' };
  }
  return { allowed: true };
}
