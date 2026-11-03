import type { Role } from '@gatepass/shared';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './AuthContext';

/** Route guard: signed-out users go to /login?returnTo=…; the wrong role sees "Not authorized" (AU-C-05, AU-C-07). */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading, loggedOut } = useAuth();
  const location = useLocation();

  if (loading) return <p className="page-status">Loading…</p>;
  if (!user) {
    // After a deliberate logout (e.g. guard shift change) the next person starts fresh, not on the old page.
    if (loggedOut) return <Navigate to="/login" replace />;
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  if (roles && !roles.includes(user.role)) return <NotAuthorized home={homeFor(user.role)} />;
  return <>{children}</>;
}

function NotAuthorized({ home }: { home: string }) {
  const label = home === '/gate' ? 'Go to the gate' : home === '/admin' ? 'Go to admin' : 'Go to my visits';
  return (
    <main className="page narrow">
      <h1>Not authorized</h1>
      <p>Your role can't open this page.</p>
      <Link to={home}>{label}</Link>
    </main>
  );
}

/** Only same-app paths are accepted as a return target (no open redirect to //evil.com). */
export function safeReturnTo(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : null;
}
