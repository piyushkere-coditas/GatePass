import { Role } from '@gatepass/shared';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** Header for the employee portal and admin pages. Admins can switch to the employee view (spec 01 UI). */
export function AppLayout() {
  const { user, signOut } = useAuth();

  return (
    <>
      <header className="app-header">
        <span className="brand">Coditas Gate Pass</span>
        <nav aria-label="Main">
          {user?.role !== Role.SECURITY && <NavLink to="/my-visits">My visits</NavLink>}
          {user?.role === Role.ADMIN && <NavLink to="/admin">Admin</NavLink>}
          {user?.role === Role.ADMIN && <NavLink to="/gate">Gate</NavLink>}
        </nav>
        <span className="who">{user?.name}</span>
        <button type="button" onClick={() => void signOut()}>
          Log out
        </button>
      </header>
      <Outlet />
    </>
  );
}
