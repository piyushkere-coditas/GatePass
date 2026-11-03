import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@gatepass/shared';
import { DomainError } from '../../common/domain-error';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

class AdminOnly {
  @Roles(Role.ADMIN)
  handler() {}

  open() {}
}

function contextFor(handler: keyof AdminOnly, user?: { role: Role }): ExecutionContext {
  return {
    getHandler: () => AdminOnly.prototype[handler],
    getClass: () => AdminOnly,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('[AU-U-05] @Roles(ADMIN) denies EMPLOYEE and SECURITY, allows ADMIN', () => {
    for (const role of [Role.EMPLOYEE, Role.SECURITY]) {
      expect(() => guard.canActivate(contextFor('handler', { role }))).toThrow(DomainError);
    }
    expect(guard.canActivate(contextFor('handler', { role: Role.ADMIN }))).toBe(true);
  });

  it('[AU-U-05] routes without @Roles are open to any signed-in role', () => {
    expect(guard.canActivate(contextFor('open', { role: Role.SECURITY }))).toBe(true);
  });
});
