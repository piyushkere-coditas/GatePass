import { Role } from '@gatepass/shared';
import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { currentLocation, renderApp } from '../test/render';
import { problem, server, signedInAs } from '../test/server';

describe('Gate header', () => {
  it('[AU-C-10] shows the guard on duty; "Switch guard" signs out to an empty login', async () => {
    signedInAs(Role.SECURITY);
    let loggedOut = false;
    server.use(
      http.post('/api/auth/logout', () => {
        loggedOut = true;
        // After logout the session is gone.
        server.use(http.get('/api/me', () => problem(401, 'UNAUTHORIZED', 'Sign in required')));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp('/gate');

    expect(await screen.findByText('Guard One')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Log out / Switch guard' }));

    await waitFor(() => expect(currentLocation()).toBe('/login'));
    expect(loggedOut).toBe(true);
    expect(await screen.findByLabelText('Coditas email')).toHaveValue('');
  });
});
