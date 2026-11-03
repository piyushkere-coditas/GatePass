import { SetMetadata } from '@nestjs/common';
import type { Role } from '@gatepass/shared';

export const ROLES_KEY = 'roles';

/** Restricts a route (or controller) to the given roles. Without it, any signed-in user may call it. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
