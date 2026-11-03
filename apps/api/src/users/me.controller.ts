import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type UserProfile, UsersService } from './users.service';

const renameSchema = z.object({ name: z.string().trim().min(2).max(100) });

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: UserProfile): UserProfile {
    return user;
  }

  @Patch()
  rename(
    @CurrentUser() user: UserProfile,
    @Body(new ZodValidationPipe(renameSchema)) body: z.infer<typeof renameSchema>,
  ): Promise<UserProfile> {
    return this.users.rename(user.id, body.name);
  }
}
