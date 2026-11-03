import { defaultNameFromEmail, normalizeEmail } from '@gatepass/shared';
import { type PrismaClient, Role } from '@prisma/client';

/** Ensures the first admin exists and is an active ADMIN (AU-8). Safe to run on every deploy. */
export async function ensureBootstrapAdmin(prisma: PrismaClient, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN, isActive: true },
    create: { email, name: defaultNameFromEmail(email), role: Role.ADMIN },
  });
}
