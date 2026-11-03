import { type RenderResult, render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { AuthProvider } from '../auth/AuthContext';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/** Renders the whole app (routes + auth) at `path`, against the MSW handlers in place. */
export function renderApp(
  path: string,
  opts: { advanceTimers?: (ms: number) => void } = {},
): RenderResult & { user: UserEvent } {
  const user = userEvent.setup(opts.advanceTimers ? { advanceTimers: opts.advanceTimers } : {});
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

export const currentLocation = () => screen.getByTestId('location').textContent;
