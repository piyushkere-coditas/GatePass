import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@gatepass/shared';
import { Roles } from '../auth/guards/roles.decorator';
import { type DirectoryEntry, UsersService } from './users.service';

/** Host picker for unplanned visits (AU-11). */
@Roles(Role.SECURITY, Role.ADMIN)
@Controller('users')
export class DirectoryController {
  constructor(private readonly users: UsersService) {}

  @Get('search')
  search(@Query('q') q: string | undefined): Promise<DirectoryEntry[]> {
    return this.users.searchHosts(q ?? '');
  }
}
