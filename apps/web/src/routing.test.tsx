import { Role } from '@gatepass/shared';
import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { currentLocation, renderApp } from './test/render';
import { profiles, server, signedInAs, signedOut } from './test/server';

describe('Route protection and role landing', () => {
  it('[AU-C-05] a signed-out visitor is sent to login and returned afterwards', async () => {
    signedOut();
    server.use(
      http.post('/api/auth/otp/request', () => HttpResponse.json({ message: 'ok' }, { status: 202 })),
      http.post('/api/auth/otp/verify', () => HttpResponse.json(profiles[Role.EMPLOYEE])),
    );
    const { user } = renderApp('/visits/new');

    await waitFor(() => expect(currentLocation()).toBe('/login?returnTo=%2Fvisits%2Fnew'));

    await user.type(await screen.findByLabelText('Coditas email'), 'alice@coditas.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '123456');

    await waitFor(() => expect(currentLocation()).toBe('/visits/new'));
  });

  it('[AU-C-05] returnTo only accepts paths inside the app', async () => {
    signedOut();
    server.use(
      http.post('/api/auth/otp/request', () => HttpResponse.json({ message: 'ok' }, { status: 202 })),
      http.post('/api/auth/otp/verify', () => HttpResponse.json(profiles[Role.EMPLOYEE])),
    );
    const { user } = renderApp('/login?returnTo=%2F%2Fevil.com');

    await user.type(await screen.findByLabelText('Coditas email'), 'alice@coditas.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '123456');

    await waitFor(() => expect(currentLocation()).toBe('/my-visits'));
  });

  it.each([
    [Role.EMPLOYEE, '/my-visits'],
    [Role.SECURITY, '/gate'],
    [Role.ADMIN, '/admin'],
  ])('[AU-C-06] %s lands on %s', async (role, home) => {
    signedInAs(role);
    renderApp('/');

    await waitFor(() => expect(currentLocation()).toBe(home));
  });

  it.each(['/my-visits', '/visits/new'])(
    '[AU-C-07] a guard opening %s sees "Not authorized"',
    async (path) => {
      signedInAs(Role.SECURITY);
      renderApp(path);

      expect(await screen.findByRole('heading', { name: 'Not authorized' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /gate/i })).toHaveAttribute('href', '/gate');
    },
  );
});
