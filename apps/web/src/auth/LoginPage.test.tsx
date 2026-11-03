import { Role } from '@gatepass/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { currentLocation, renderApp } from '../test/render';
import { problem, profiles, server, signedOut } from '../test/server';

const GENERIC = { message: 'If this is a Coditas account, a code has been sent.' };

/** Records the bodies sent to the sign-in endpoints. */
function signInApi(verify: () => Response = () => HttpResponse.json(profiles[Role.EMPLOYEE])) {
  const calls = { request: [] as unknown[], verify: [] as Array<{ email: string; code: string }> };
  server.use(
    http.post('/api/auth/otp/request', async ({ request }) => {
      calls.request.push(await request.json());
      return HttpResponse.json(GENERIC, { status: 202 });
    }),
    http.post('/api/auth/otp/verify', async ({ request }) => {
      calls.verify.push((await request.json()) as { email: string; code: string });
      return verify();
    }),
  );
  return calls;
}

describe('LoginPage', () => {
  beforeEach(() => signedOut());

  it('[AU-C-01] sending a code moves to the code step; "Resend code" waits 30 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const calls = signInApi();
      const { user } = renderApp('/login', { advanceTimers: vi.advanceTimersByTime });

      await user.type(await screen.findByLabelText('Coditas email'), 'alice@coditas.com');
      await user.click(screen.getByRole('button', { name: 'Send code' }));

      expect(await screen.findByText(/alice@coditas\.com/)).toBeInTheDocument();
      expect(calls.request).toEqual([{ email: 'alice@coditas.com' }]);
      const resend = screen.getByRole('button', { name: /Resend code/ });
      expect(resend).toBeDisabled();
      expect(resend).toHaveTextContent('Resend code in 30s');

      act(() => vi.advanceTimersByTime(30_000));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled());
    } finally {
      vi.useRealTimers();
    }
  });

  it('[AU-C-02] a non-Coditas email is rejected inline without calling the API', async () => {
    const calls = signInApi();
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Coditas email'), 'x@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(screen.getByText('Use your Coditas email (@coditas.com)')).toBeInTheDocument();
    expect(calls.request).toEqual([]);
  });

  it('[AU-C-03] the code field is numeric, ignores non-digits and submits itself at 6 digits', async () => {
    const calls = signInApi();
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Coditas email'), 'alice@coditas.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    const code = await screen.findByLabelText('6-digit code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');

    await user.type(code, '1a2b3 4');
    expect(code).toHaveValue('1234');
    expect(calls.verify).toEqual([]);
    await user.type(code, '56');

    await waitFor(() => expect(calls.verify).toEqual([{ email: 'alice@coditas.com', code: '123456' }]));
    await waitFor(() => expect(currentLocation()).toBe('/my-visits'));
  });

  it('[AU-C-03] a pasted code is accepted as-is', async () => {
    const calls = signInApi();
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Coditas email'), 'alice@coditas.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    await user.click(await screen.findByLabelText('6-digit code'));
    await user.paste('654 321');

    await waitFor(() => expect(calls.verify).toEqual([{ email: 'alice@coditas.com', code: '654321' }]));
  });

  it('[AU-C-04] a wrong or expired code shows a clear message', async () => {
    signInApi(() => problem(401, 'INVALID_CODE', 'That code is invalid or expired.'));
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Coditas email'), 'alice@coditas.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    await user.type(await screen.findByLabelText('6-digit code'), '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent('That code is invalid or expired.');
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');
  });

  it('[AU-C-04] too many code requests shows when to try again', async () => {
    server.use(
      http.post('/api/auth/otp/request', () =>
        problem(429, 'TOO_MANY_REQUESTS', 'Too many code requests. Try again later.', {
          retryAfterSeconds: 540,
        }),
      ),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Coditas email'), 'alice@coditas.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 9 minutes.');
  });
});
