import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { DirectoryController } from './directory.controller';
import { MeController } from './me.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [MeController, DirectoryController, AdminUsersController],
  providers: [UsersService, AdminUsersService],
  exports: [UsersService],
})
export class UsersModule {}
