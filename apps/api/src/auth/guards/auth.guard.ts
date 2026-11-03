import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserProfile } from '../../users/users.service';
import { ACCESS_COOKIE, readCookie } from '../session/cookies';
import { SessionService } from '../session/session.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Global: every route needs a signed-in, active user unless marked @Public() (AU-5, AU-7). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<Request & { user?: UserProfile }>();
    req.user = await this.sessions.authenticate(readCookie(req, ACCESS_COOKIE));
    return true;
  }
}
