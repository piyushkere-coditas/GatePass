import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { AUTH_CONFIG, authConfigFromEnv } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OtpService } from './otp/otp.service';
import { SessionService } from './session/session.service';

@Module({})
export class AuthModule {
  static forEnv(nodeEnv: string): DynamicModule {
    return {
      module: AuthModule,
      imports: [UsersModule],
      controllers: [AuthController],
      providers: [
        { provide: AUTH_CONFIG, useValue: authConfigFromEnv(nodeEnv) },
        OtpService,
        SessionService,
        // Order matters: the sign-in check runs first, then @Roles.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
      exports: [SessionService],
    };
  }
}
