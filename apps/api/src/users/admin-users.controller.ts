import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@gatepass/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/guards/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type AdminUserView, AdminUsersService } from './admin-users.service';
import type { UserProfile } from './users.service';

const roleSchema = z.enum([Role.EMPLOYEE, Role.SECURITY, Role.ADMIN]);
const nameSchema = z.string().trim().min(2).max(100);

const listSchema = z.object({
  role: roleSchema.optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const createSchema = z.object({
  email: z.string().max(254),
  name: nameSchema,
  role: roleSchema,
});

const updateSchema = z
  .object({ name: nameSchema.optional(), role: roleSchema.optional(), isActive: z.boolean().optional() })
  .refine((c) => Object.values(c).some((v) => v !== undefined), 'Nothing to change');

@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly admin: AdminUsersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.admin.list(query);
  }

  @Post()
  create(
    @CurrentUser() actor: UserProfile,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ): Promise<AdminUserView> {
    return this.admin.create(actor.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: UserProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<AdminUserView> {
    return this.admin.update(actor.id, id, body);
  }
}
