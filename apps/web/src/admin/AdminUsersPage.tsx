import { Role, isCoditasEmail } from '@gatepass/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import { ConfirmDialog, Dialog } from '../components/ConfirmDialog';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  notSignedInYet: boolean;
  createdAt: string;
}

interface Page {
  items: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.EMPLOYEE]: 'Employee',
  [Role.SECURITY]: 'Security',
  [Role.ADMIN]: 'Admin',
};
const ROLES = Object.keys(ROLE_LABELS) as Role[];

interface PendingChange {
  message: string;
  user: AdminUser;
  change: Partial<Pick<AdminUser, 'role' | 'isActive'>>;
}

const messageOf = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';

/** /admin/users: list, filters, pre-register, role and active changes with confirmation (AU-C-08, AU-C-09). */
export function AdminUsersPage() {
  const [role, setRole] = useState<Role | ''>('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (role) params.set('role', role);
    if (active) params.set('active', active);
    if (q.trim()) params.set('q', q.trim());
    try {
      setData(await api<Page>(`/admin/users?${params.toString()}`));
    } catch (e) {
      setToast(messageOf(e));
    }
  }, [role, active, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceRow = (updated: AdminUser) =>
    setData((d) => d && { ...d, items: d.items.map((u) => (u.id === updated.id ? updated : u)) });

  async function applyChange({ user, change }: PendingChange): Promise<void> {
    setPending(null);
    try {
      replaceRow(await api<AdminUser>(`/admin/users/${user.id}`, { method: 'PATCH', body: change }));
      setToast(null);
    } catch (e) {
      setToast(messageOf(e));
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="page">
      <div className="row between">
        <h1>Users</h1>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Add user
        </button>
      </div>

      {toast && (
        <p role="alert" className="toast">
          {toast}
          <button type="button" className="link" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </p>
      )}

      <div className="filters row">
        <label>
          Role{' '}
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | '');
              setPage(1);
            }}
          >
            <option value="">All</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status{' '}
          <select
            value={active}
            onChange={(e) => {
              setActive(e.target.value as '' | 'true' | 'false');
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <label>
          Search{' '}
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      <table className="users">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>
                {u.email}
                {u.notSignedInYet && <span className="badge">Not signed in yet</span>}
              </td>
              <td>
                <select
                  aria-label={`Role for ${u.name}`}
                  value={u.role}
                  onChange={(e) => {
                    const next = e.target.value as Role;
                    setPending({
                      user: u,
                      change: { role: next },
                      message: `Change ${u.name}'s role to ${ROLE_LABELS[next]}?`,
                    });
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <span className={u.isActive ? 'status ok' : 'status off'}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </span>{' '}
                <button
                  type="button"
                  aria-label={u.isActive ? 'Deactivate' : 'Activate'}
                  onClick={() =>
                    setPending({
                      user: u,
                      change: { isActive: !u.isActive },
                      message: u.isActive
                        ? `Deactivate ${u.name}? They are signed out immediately.`
                        : `Reactivate ${u.name}?`,
                    })
                  }
                >
                  {u.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.items.length === 0 && <p className="page-status">No users match these filters.</p>}

      {pages > 1 && (
        <nav className="row" aria-label="Pages">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </nav>
      )}

      {pending && (
        <ConfirmDialog
          message={pending.message}
          onConfirm={() => void applyChange(pending)}
          onCancel={() => setPending(null)}
        />
      )}
      {adding && (
        <AddUserDialog
          onClose={() => setAdding(false)}
          onAdded={(created) => {
            setAdding(false);
            setData((d) => d && { ...d, items: [...d.items, created], total: d.total + 1 });
          }}
        />
      )}
    </main>
  );
}

function AddUserDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (u: AdminUser) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>(Role.SECURITY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!isCoditasEmail(email)) {
      setError('Use a Coditas email (@coditas.com)');
      return;
    }
    if (name.trim().length < 2) {
      setError('Enter a name (at least 2 characters)');
      return;
    }
    setBusy(true);
    try {
      onAdded(
        await api<AdminUser>('/admin/users', {
          method: 'POST',
          body: { email: email.trim(), name: name.trim(), role },
        }),
      );
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Add user" onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        <label htmlFor="add-email">Email</label>
        <input id="add-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="add-name">Name</label>
        <input id="add-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="add-role">Role</label>
        <select id="add-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Add
          </button>
        </div>
      </form>
    </Dialog>
  );
}
