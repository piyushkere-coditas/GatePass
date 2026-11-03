import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@gatepass/shared';
import { DomainError } from '../../common/domain-error';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: { role: Role } }>().user;
    if (!user) throw new DomainError('UNAUTHORIZED', 'Sign in required');
    if (!required.includes(user.role)) throw new DomainError('FORBIDDEN', 'Your role cannot do this');
    return true;
  }
}
