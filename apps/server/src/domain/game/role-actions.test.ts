import { describe, expect, it } from 'vitest';
import { NightActionType, RoleId, Team } from '@tattletale/shared';
import { validateRoleAction } from './role-actions.js';

describe('validateRoleAction — WHITE_HAT_HACKER', () => {
  it('allows a WHITE_HAT_HACKER to submit INVESTIGATE', () => {
    const result = validateRoleAction({
      roleId: RoleId.WHITE_HAT_HACKER,
      team: Team.FRIENDS,
      actionType: NightActionType.INVESTIGATE,
    });
    expect(result).toEqual({ allowed: true });
  });

  it('rejects a WHITE_HAT_HACKER submitting an action they do not own', () => {
    const result = validateRoleAction({
      roleId: RoleId.WHITE_HAT_HACKER,
      team: Team.FRIENDS,
      actionType: NightActionType.HACKER_KILL,
    });
    expect(result).toEqual({ allowed: false, reason: 'ROLE_CANNOT_SUBMIT_ACTION' });
  });

  it('rejects INVESTIGATE from a role that is not mapped to it', () => {
    const result = validateRoleAction({
      roleId: RoleId.HACKER,
      team: Team.HACKERS,
      actionType: NightActionType.INVESTIGATE,
    });
    expect(result).toEqual({ allowed: false, reason: 'ROLE_CANNOT_SUBMIT_ACTION' });
  });
});
