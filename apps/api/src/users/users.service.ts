import { Injectable } from '@nestjs/common';
import { Role, defaultNameFromEmail, normalizeEmail } from '@gatepass/shared';
import type { Prisma, User } from '@prisma/client';
import { Clock } from '../common/clock';
import { DomainError } from '../common/domain-error';
import { PrismaService } from '../prisma/prisma.service';

/** What the API returns for the signed-in user (GET /me, sign-in). */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function toProfile(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): UserProfile {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** A possible visit host, as shown in the gate's host picker. */
export interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
}

export const DIRECTORY_LIMIT = 10;

type Db = Pick<Prisma.TransactionClient, 'user'>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * Records a successful sign-in: matches an existing or pre-registered user by email (AU-3), otherwise creates
   * an EMPLOYEE (JIT, AU-2). Returns null for a deactivated user (AU-7).
   */
  async recordSignIn(db: Db, rawEmail: string): Promise<User | null> {
    const email = normalizeEmail(rawEmail);
    const now = this.clock.now();
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: { email, name: defaultNameFromEmail(email), lastLoginAt: now },
    });
    if (!user.isActive) return null;
    return db.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  }

  /**
   * Active employees and admins whose name (any word) or email starts with `q` (AU-11). Security users never host
   * visits, so they are not listed (AU-10).
   */
  async searchHosts(rawQuery: string): Promise<DirectoryEntry[]> {
    const q = rawQuery.trim().slice(0, 100);
    if (q.length < 2) throw new DomainError('QUERY_TOO_SHORT', 'Type at least 2 characters');
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.EMPLOYEE, Role.ADMIN] },
        OR: [
          { name: { startsWith: q, mode: 'insensitive' } },
          { name: { contains: ` ${q}`, mode: 'insensitive' } },
          { email: { startsWith: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      take: DIRECTORY_LIMIT,
      select: { id: true, name: true, email: true },
    });
  }

  async rename(id: string, name: string): Promise<UserProfile> {
    return toProfile(await this.prisma.user.update({ where: { id }, data: { name } }));
  }
}
