import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type UserProfile, toProfile } from '../users/users.service';
import { Public } from './guards/public.decorator';
import { OtpService } from './otp/otp.service';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  readCookie,
  setSessionCookies,
} from './session/cookies';
import { SessionService } from './session/session.service';

export const CODE_SENT_MESSAGE = 'If this is a Coditas account, a code has been sent.';

const requestSchema = z.object({ email: z.string().max(254) });
const verifySchema = z.object({ email: z.string().max(254), code: z.string().max(12) });

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
  ) {}

  @Post('otp/request')
  @HttpCode(202)
  async requestCode(
    @Body(new ZodValidationPipe(requestSchema)) body: z.infer<typeof requestSchema>,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.otp.request(body.email, req.ip);
    return { message: CODE_SENT_MESSAGE };
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyCode(
    @Body(new ZodValidationPipe(verifySchema)) body: z.infer<typeof verifySchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserProfile> {
    const { user, tokens } = await this.otp.verify(body.email, body.code);
    setSessionCookies(res, tokens);
    return toProfile(user);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<UserProfile> {
    try {
      const { user, tokens } = await this.sessions.rotate(readCookie(req, REFRESH_COOKIE));
      setSessionCookies(res, tokens);
      return user;
    } catch (error) {
      clearSessionCookies(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.end(readCookie(req, REFRESH_COOKIE), readCookie(req, ACCESS_COOKIE));
    clearSessionCookies(res);
  }
}
