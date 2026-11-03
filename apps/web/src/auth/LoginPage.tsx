import { isCoditasEmail, normalizeEmail } from '@gatepass/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { type User, homeFor, useAuth } from './AuthContext';
import { safeReturnTo } from './RequireAuth';

const RESEND_AFTER_S = 30;
const CODE_LENGTH = 6;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CODE') return 'That code is invalid or expired.';
    if (error.code === 'TOO_MANY_REQUESTS') {
      const seconds = Number(error.details?.retryAfterSeconds ?? 60);
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }
    if (error.code === 'DOMAIN_NOT_ALLOWED') return 'Use your Coditas email (@coditas.com)';
  }
  return 'Something went wrong. Please try again.';
}

/** Two-step sign-in: email → 6-digit emailed code (spec 01 UI, AU-C-01..04). */
export function LoginPage() {
  const { user, signedIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const codeInput = useRef<HTMLInputElement>(null);

  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  if (user) return <Navigate to={returnTo ?? homeFor(user.role)} replace />;

  async function sendCode(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await api('/auth/otp/request', { method: 'POST', body: { email: normalizeEmail(email) } });
      setStep('code');
      setCode('');
      setNow(Date.now());
      setResendAt(Date.now() + RESEND_AFTER_S * 1000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onEmailSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!isCoditasEmail(email)) {
      setError('Use your Coditas email (@coditas.com)');
      return;
    }
    await sendCode();
  }

  async function verify(value: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const me = await api<User>('/auth/otp/verify', {
        method: 'POST',
        body: { email: normalizeEmail(email), code: value },
      });
      signedIn(me);
      navigate(returnTo ?? homeFor(me.role), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
      setBusy(false);
      codeInput.current?.focus();
    }
  }

  function onCodeChange(raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && !busy) void verify(digits);
  }

  return (
    <main className="page narrow">
      <h1>Coditas Gate Pass</h1>
      {step === 'email' ? (
        <form onSubmit={onEmailSubmit} noValidate>
          <label htmlFor="login-email">Coditas email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={error ? true : undefined}
            required
          />
          {error && (
            <p id="login-error" role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => e.preventDefault()} noValidate>
          <p>
            We sent a 6-digit code to <strong>{normalizeEmail(email)}</strong>. It expires in 10 minutes.
          </p>
          <label htmlFor="login-code">6-digit code</label>
          <input
            id="login-code"
            ref={codeInput}
            className="code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH + 4}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={error ? true : undefined}
            disabled={busy}
          />
          {error && (
            <p id="login-error" role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row">
            <button type="button" onClick={() => void sendCode()} disabled={busy || resendIn > 0}>
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep('email');
                setError(null);
                setCode('');
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
