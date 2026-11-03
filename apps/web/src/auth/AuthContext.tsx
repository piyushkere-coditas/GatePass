import { Role } from '@gatepass/shared';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthState {
  /** null = signed out. */
  user: User | null;
  /** True until the initial GET /me has answered. */
  loading: boolean;
  /** The user pressed Log out (vs. never signed in or session expired): go to a plain /login. */
  loggedOut: boolean;
  signedIn(user: User): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Landing page per role (spec 01 sign-in flow, step 4). */
export function homeFor(role: Role): string {
  if (role === Role.SECURITY) return '/gate';
  if (role === Role.ADMIN) return '/admin';
  return '/my-visits';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    let alive = true;
    api<User>('/me')
      .then((me) => alive && setUser(me))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    // Logout only ends the session; it never changes any visit (AU-9).
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setLoggedOut(true);
    setUser(null);
  }, []);

  const signedIn = useCallback((me: User) => {
    setLoggedOut(false);
    setUser(me);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, loggedOut, signedIn, signOut }),
    [user, loading, loggedOut, signedIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>');
  return state;
}
