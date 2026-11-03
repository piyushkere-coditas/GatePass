import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { UserProfile } from '../users/users.service';

/** The signed-in user, set by AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserProfile =>
    ctx.switchToHttp().getRequest<{ user: UserProfile }>().user,
);
