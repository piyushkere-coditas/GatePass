import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Gate tablet shell: the guard on duty is always visible, with one big button for shift changes on the shared
 * device (AU-12). Logging out never changes any visit (AU-9).
 */
export function GateLayout() {
  const { user, signOut } = useAuth();

  return (
    <>
      <header className="app-header gate">
        <span className="brand">Gate</span>
        <span className="who">
          <span className="who-label">On duty:</span> <strong>{user?.name}</strong>
        </span>
        <button type="button" className="primary big" onClick={() => void signOut()}>
          Log out / Switch guard
        </button>
      </header>
      <Outlet />
    </>
  );
}
