import { Role } from '@gatepass/shared';
import { DomainError, type DomainErrorCode } from '../common/domain-error';
import { actors } from '../../test/fixtures';
import { type UserChangeInput, assertUserChange } from './user-change.policy';

const carol = { id: actors.carol.id, role: Role.ADMIN, isActive: true };
const frank = { id: actors.frank.id, role: Role.ADMIN, isActive: true };
const alice = { id: actors.alice.id, role: Role.EMPLOYEE, isActive: true };
const guard = { id: actors.guard1.id, role: Role.SECURITY, isActive: true };

function expectCode(input: UserChangeInput, code: DomainErrorCode) {
  expect(() => assertUserChange(input)).toThrow(DomainError);
  try {
    assertUserChange(input);
  } catch (e) {
    expect((e as DomainError).code).toBe(code);
  }
}

describe('assertUserChange', () => {
  it('[AU-U-07] the last active admin cannot be demoted or deactivated', () => {
    expectCode(
      { actorId: frank.id, target: carol, change: { role: Role.EMPLOYEE }, activeAdminCount: 1 },
      'LAST_ADMIN',
    );
    expectCode(
      { actorId: frank.id, target: carol, change: { isActive: false }, activeAdminCount: 1 },
      'LAST_ADMIN',
    );
  });

  it('[AU-U-08] an admin cannot deactivate themselves', () => {
    expectCode(
      { actorId: carol.id, target: carol, change: { isActive: false }, activeAdminCount: 2 },
      'SELF_DEACTIVATION',
    );
  });

  it('[AU-U-09] any role change is allowed otherwise', () => {
    const ok = (target: UserChangeInput['target'], change: UserChangeInput['change'], activeAdminCount = 2) =>
      expect(() => assertUserChange({ actorId: carol.id, target, change, activeAdminCount })).not.toThrow();
    ok(alice, { role: Role.ADMIN });
    ok(alice, { role: Role.SECURITY });
    ok(guard, { role: Role.EMPLOYEE });
    ok(guard, { role: Role.ADMIN });
    ok(frank, { role: Role.EMPLOYEE });
    ok(alice, { isActive: false }, 1);
    ok(carol, { role: Role.ADMIN }, 1); // no-op on the last admin is fine
  });
});
