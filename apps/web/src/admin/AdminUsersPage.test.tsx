import { Role } from '@gatepass/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { renderApp } from '../test/render';
import { problem, server, signedInAs } from '../test/server';

interface Row {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  notSignedInYet: boolean;
  createdAt: string;
}

const row = (id: string, name: string, role: Role, extra: Partial<Row> = {}): Row => ({
  id,
  email: `${id}@coditas.com`,
  name,
  role,
  isActive: true,
  lastLoginAt: '2026-11-02T04:30:00.000Z',
  notSignedInYet: false,
  createdAt: '2026-11-01T04:30:00.000Z',
  ...extra,
});

/** A small in-memory /admin/users backend. */
function adminUsersApi(initial: Row[]) {
  const rows = [...initial];
  const patches: Array<{ id: string; body: unknown }> = [];
  const posts: unknown[] = [];
  server.use(
    http.get('/api/admin/users', () =>
      HttpResponse.json({ items: rows, page: 1, pageSize: 20, total: rows.length }),
    ),
    http.post('/api/admin/users', async ({ request }) => {
      const body = (await request.json()) as { email: string; name: string; role: Role };
      posts.push(body);
      const created = row('guard3', body.name, body.role, {
        email: body.email,
        lastLoginAt: null,
        notSignedInYet: true,
      });
      rows.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch('/api/admin/users/:id', async ({ params, request }) => {
      const body = (await request.json()) as Partial<Row>;
      patches.push({ id: params.id as string, body });
      if (params.id === 'carol' && body.role) {
        return problem(422, 'LAST_ADMIN', 'At least one active admin is required');
      }
      const i = rows.findIndex((r) => r.id === params.id);
      rows[i] = { ...rows[i]!, ...body };
      return HttpResponse.json(rows[i]);
    }),
  );
  return { patches, posts };
}

const users = [
  row('alice', 'Alice Host', Role.EMPLOYEE),
  row('bob', 'Bob Employee', Role.EMPLOYEE),
  row('carol', 'Carol Admin', Role.ADMIN),
  row('guard1', 'Guard One', Role.SECURITY, { lastLoginAt: null, notSignedInYet: true }),
];

const rowOf = async (name: string) => (await screen.findByRole('cell', { name })).closest('tr')!;

describe('Admin users page', () => {
  beforeEach(() => signedInAs(Role.ADMIN));

  it('[AU-C-08] "Add user" pre-registers a guard; other domains get an inline error', async () => {
    const api = adminUsersApi(users);
    const { user } = renderApp('/admin/users');
    expect(within(await rowOf('Guard One')).getByText('Not signed in yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog', { name: 'Add user' });
    await user.type(within(dialog).getByLabelText('Email'), 'guard3@gmail.com');
    await user.type(within(dialog).getByLabelText('Name'), 'Guard Three');
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'SECURITY');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(within(dialog).getByText('Use a Coditas email (@coditas.com)')).toBeInTheDocument();
    expect(api.posts).toEqual([]);

    await user.clear(within(dialog).getByLabelText('Email'));
    await user.type(within(dialog).getByLabelText('Email'), 'guard3@coditas.com');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(api.posts).toEqual([{ email: 'guard3@coditas.com', name: 'Guard Three', role: 'SECURITY' }]),
    );
    expect(within(await rowOf('Guard Three')).getByText('Not signed in yet')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('[AU-C-09] a role change is confirmed, then saved', async () => {
    const api = adminUsersApi(users);
    const { user } = renderApp('/admin/users');

    await user.selectOptions(
      within(await rowOf('Alice Host')).getByLabelText('Role for Alice Host'),
      'ADMIN',
    );
    const confirm = screen.getByRole('dialog', { name: 'Confirm change' });
    expect(confirm).toHaveTextContent("Change Alice Host's role to Admin?");
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.patches).toEqual([{ id: 'alice', body: { role: 'ADMIN' } }]));
    expect(within(await rowOf('Alice Host')).getByLabelText('Role for Alice Host')).toHaveValue('ADMIN');
  });

  it('[AU-C-09] cancelling the confirmation changes nothing', async () => {
    const api = adminUsersApi(users);
    const { user } = renderApp('/admin/users');

    await user.selectOptions(
      within(await rowOf('Alice Host')).getByLabelText('Role for Alice Host'),
      'SECURITY',
    );
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(api.patches).toEqual([]);
    expect(within(await rowOf('Alice Host')).getByLabelText('Role for Alice Host')).toHaveValue('EMPLOYEE');
  });

  it('[AU-C-09] deactivation is confirmed, then the row shows Inactive', async () => {
    const api = adminUsersApi(users);
    const { user } = renderApp('/admin/users');

    await user.click(within(await rowOf('Bob Employee')).getByRole('button', { name: 'Deactivate' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.patches).toEqual([{ id: 'bob', body: { isActive: false } }]));
    expect(within(await rowOf('Bob Employee')).getByText('Inactive')).toBeInTheDocument();
  });

  it('[AU-C-09] a LAST_ADMIN refusal is shown as a message and the row is unchanged', async () => {
    adminUsersApi(users);
    const { user } = renderApp('/admin/users');

    await user.selectOptions(
      within(await rowOf('Carol Admin')).getByLabelText('Role for Carol Admin'),
      'EMPLOYEE',
    );
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('At least one active admin is required');
    expect(within(await rowOf('Carol Admin')).getByLabelText('Role for Carol Admin')).toHaveValue('ADMIN');
  });
});
