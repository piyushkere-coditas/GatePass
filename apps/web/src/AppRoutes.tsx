import { Role } from '@gatepass/shared';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { homeFor, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { GateLayout } from './gate/GateLayout';
import { AppLayout } from './layout/AppLayout';

const HOSTS = [Role.EMPLOYEE, Role.ADMIN];

function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user!.role)} replace />;
}

/** Holding pages until their phase builds them (My Visits: Phase 2, Gate: Phase 3). */
function ComingSoon({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p className="page-status">Coming soon.</p>
    </main>
  );
}

function AdminHome() {
  return (
    <main className="page">
      <h1>Admin</h1>
      <ul className="tiles">
        <li>
          <Link to="/admin/users">Users</Link>
        </li>
      </ul>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RoleHome />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth roles={HOSTS}>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/my-visits" element={<ComingSoon title="My visits" />} />
        <Route path="/visits/new" element={<ComingSoon title="New visit" />} />
      </Route>
      <Route
        element={
          <RequireAuth roles={[Role.SECURITY, Role.ADMIN]}>
            <GateLayout />
          </RequireAuth>
        }
      >
        <Route path="/gate" element={<ComingSoon title="Today at the gate" />} />
      </Route>
      <Route
        element={
          <RequireAuth roles={[Role.ADMIN]}>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
      </Route>
      <Route path="*" element={<ComingSoon title="Page not found" />} />
    </Routes>
  );
}
