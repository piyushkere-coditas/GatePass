import type { CookieOptions, Request, Response } from 'express';
import { ACCESS_TTL_MS, type SessionTokens } from './session.service';

export const ACCESS_COOKIE = 'access';
export const REFRESH_COOKIE = 'refresh';

/** httpOnly + Secure + SameSite=Lax (AU-6). Browsers accept Secure cookies on http://localhost too. */
const base: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' };
/**
 * The refresh token is only ever sent to the /auth routes. Browsers reach the API through a same-origin `/api`
 * prefix (Vite proxy locally, nginx in AWS), so the cookie path must include it.
 */
const REFRESH_PATH = `${process.env.PUBLIC_API_PREFIX ?? '/api'}/auth`;

export function setSessionCookies(res: Response, tokens: SessionTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, path: '/', maxAge: ACCESS_TTL_MS });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_PATH,
    expires: tokens.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
}

export function readCookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value ? value : undefined;
}
