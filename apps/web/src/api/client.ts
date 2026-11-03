/** The API is same-origin under /api (Vite proxy locally, nginx in AWS), so session cookies just work. */
const BASE = '/api';

export interface FieldError {
  field: string;
  message: string;
}

/** An RFC 7807 problem response from the API, with its stable `code`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit an expired access token. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(url('/auth/refresh'), { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function url(path: string): string {
  return new URL(BASE + path, window.location.href).toString();
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = () =>
    fetch(url(path), {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

  let res = await send();
  // Access tokens last 15 minutes: renew once and retry (sign-in routes report their own 401s).
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) res = await send();

  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as {
      code?: string;
      title?: string;
      details?: Record<string, unknown>;
      errors?: FieldError[];
    };
    throw new ApiError(
      res.status,
      problem.code ?? 'HTTP_ERROR',
      problem.title ?? res.statusText,
      problem.details,
      problem.errors,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
