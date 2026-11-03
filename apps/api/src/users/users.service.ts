import { Injectable } from '@nestjs/common';
import { type Role, defaultNameFromEmail, normalizeEmail } from '@gatepass/shared';
import type { Prisma, User } from '@prisma/client';
import { Clock } from '../common/clock';
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

type Db = Pick<Prisma.TransactionClient, 'user'>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  findActiveByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email: normalizeEmail(email), isActive: true } });
  }

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

  async rename(id: string, name: string): Promise<UserProfile> {
    return toProfile(await this.prisma.user.update({ where: { id }, data: { name } }));
  }
}
