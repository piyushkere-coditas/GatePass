import { Role } from '@gatepass/shared';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

/** MSW server for component tests. Unhandled requests fail the test (setup.ts). */
export const server = setupServer();

export const profiles = {
  [Role.EMPLOYEE]: { id: 'u-alice', email: 'alice@coditas.com', name: 'Alice Host', role: Role.EMPLOYEE },
  [Role.SECURITY]: { id: 'u-guard1', email: 'guard1@coditas.com', name: 'Guard One', role: Role.SECURITY },
  [Role.ADMIN]: { id: 'u-carol', email: 'carol@coditas.com', name: 'Carol Admin', role: Role.ADMIN },
} as const;

export function problem(status: number, code: string, title: string, details?: Record<string, unknown>) {
  return HttpResponse.json(
    { type: `https://gatepass.coditas.com/problems/${code}`, title, status, code, instance: '/', details },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

/** Signed out: /me and the refresh both answer 401. */
export function signedOut(): void {
  server.use(
    http.get('/api/me', () => problem(401, 'UNAUTHORIZED', 'Sign in required')),
    http.post('/api/auth/refresh', () => problem(401, 'UNAUTHORIZED', 'Sign in required')),
  );
}

export function signedInAs(role: Role): void {
  server.use(http.get('/api/me', () => HttpResponse.json(profiles[role])));
}
