import { Role } from '@gatepass/shared';
import { DomainError } from '../common/domain-error';

export interface UserChangeInput {
  actorId: string;
  target: { id: string; role: Role; isActive: boolean };
  change: { role?: Role; isActive?: boolean };
  /** Active admins right now, including the target if it is one. */
  activeAdminCount: number;
}

/** Admin user-management guard rails (AU-4). */
export function assertUserChange({ actorId, target, change, activeAdminCount }: UserChangeInput): void {
  if (change.isActive === false && target.id === actorId) {
    throw new DomainError('SELF_DEACTIVATION', 'You cannot deactivate your own account');
  }
  const isActiveAdmin = target.role === Role.ADMIN && target.isActive;
  const losesAdmin = (change.role !== undefined && change.role !== Role.ADMIN) || change.isActive === false;
  if (isActiveAdmin && losesAdmin && activeAdminCount <= 1) {
    throw new DomainError('LAST_ADMIN', 'At least one active admin is required');
  }
}
