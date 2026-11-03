import { Role } from '@gatepass/shared';
import { screen } from '@testing-library/react';
import axe from 'axe-core';
import { HttpResponse, http } from 'msw';
import { renderApp } from './test/render';
import { server, signedInAs, signedOut } from './test/server';

async function violations(container: HTMLElement) {
  // jsdom has no layout engine, so colour contrast is checked in the E2E/axe audit (Phase 6) instead.
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(', ')}`);
}

describe('Accessibility', () => {
  // axe probes icon fonts with a canvas, which jsdom doesn't implement; returning null just skips that probe.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterAll(() => vi.restoreAllMocks());

  it('[AU-C-11] the login page has no axe violations', async () => {
    signedOut();
    const { container } = renderApp('/login');
    await screen.findByLabelText('Coditas email');

    expect(await violations(container)).toEqual([]);
  });

  it('[AU-C-11] the admin users page has no axe violations', async () => {
    signedInAs(Role.ADMIN);
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          items: [
            {
              id: 'guard1',
              email: 'guard1@coditas.com',
              name: 'Guard One',
              role: Role.SECURITY,
              isActive: true,
              lastLoginAt: null,
              notSignedInYet: true,
              createdAt: '2026-11-01T04:30:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      ),
    );
    const { container } = renderApp('/admin/users');
    await screen.findByRole('cell', { name: 'Guard One' });

    expect(await violations(container)).toEqual([]);
  });
});
