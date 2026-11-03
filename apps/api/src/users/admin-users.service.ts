import { Injectable } from '@nestjs/common';
import { type Role, isCoditasEmail, normalizeEmail } from '@gatepass/shared';
import { Prisma, Role as DbRole, type User } from '@prisma/client';
import { Clock } from '../common/clock';
import { DomainError } from '../common/domain-error';
import { PrismaService } from '../prisma/prisma.service';
import { assertUserChange } from './user-change.policy';

export const ADMIN_PAGE_SIZE = 20;

/** A user as admins see it (spec 01, /admin/users). */
export interface AdminUserView {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  /** Pre-registered and never signed in (AU-3). */
  notSignedInYet: boolean;
  createdAt: Date;
}

export interface UserListQuery {
  role?: Role;
  active?: boolean;
  q?: string;
  page: number;
}

export interface UserChange {
  name?: string;
  role?: Role;
  isActive?: boolean;
}

/** Serialises admin changes so two admins can't demote each other at the same moment (LAST_ADMIN). */
const ADMIN_CHANGE_LOCK = 47_110_001;

function toView(user: User): AdminUserView {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    notSignedInYet: user.lastLoginAt === null,
    createdAt: user.createdAt,
  };
}

/** Admin user management (AU-3, AU-4): pre-registration, role changes, (de)activation. All changes audited. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(
    query: UserListQuery,
  ): Promise<{ items: AdminUserView[]; page: number; pageSize: number; total: number }> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      isActive: query.active,
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ name: 'asc' }, { email: 'asc' }],
        skip: (query.page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
    ]);
    return { items: rows.map(toView), page: query.page, pageSize: ADMIN_PAGE_SIZE, total };
  }

  async create(actorId: string, input: { email: string; name: string; role: Role }): Promise<AdminUserView> {
    const email = normalizeEmail(input.email);
    if (!isCoditasEmail(email))
      throw new DomainError('DOMAIN_NOT_ALLOWED', 'Use a Coditas email (@coditas.com)');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, name: input.name, role: input.role, createdById: actorId },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'USER_CREATED',
            entity: 'User',
            entityId: user.id,
            data: { email, role: input.role },
            createdAt: this.clock.now(),
          },
        });
        return toView(user);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('USER_EXISTS', 'A user with this email already exists');
      }
      throw error;
    }
  }

  async update(actorId: string, id: string, change: UserChange): Promise<AdminUserView> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_CHANGE_LOCK})`;
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new DomainError('NOT_FOUND', 'User not found');
      const activeAdminCount = await tx.user.count({ where: { role: DbRole.ADMIN, isActive: true } });
      assertUserChange({ actorId, target, change, activeAdminCount });

      const before: Partial<UserChange> = {};
      const after: Partial<UserChange> = {};
      for (const key of ['name', 'role', 'isActive'] as const) {
        if (change[key] !== undefined && change[key] !== target[key]) {
          Object.assign(before, { [key]: target[key] });
          Object.assign(after, { [key]: change[key] });
        }
      }
      if (Object.keys(after).length === 0) return toView(target);

      const user = await tx.user.update({ where: { id }, data: after });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'USER_UPDATED',
          entity: 'User',
          entityId: id,
          data: { before, after } as Prisma.InputJsonObject,
          createdAt: this.clock.now(),
        },
      });
      return toView(user);
    });
  }
}
