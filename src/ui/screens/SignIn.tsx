import { useLocation } from 'preact-iso';
import { useEffect, useState } from 'preact/hooks';
import { sessionStore } from '../../auth/session';
import { RemoteError } from '../../server/errors';
import { server } from '../../server';
import { useOnline } from '../hooks/useOnline';
import { useStore } from '../hooks/useStore';
import { paths } from '../paths';

export function signInErrorText(err: unknown): string {
  if (err instanceof RemoteError) {
    if (err.kind === 'auth') return 'Email or password is not right';
    if (err.kind === 'network') return 'No connection. Signing in needs a connection.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Could not sign in';
}

export function SignIn() {
  const { route } = useLocation();
  const session = useStore(sessionStore);
  const online = useOnline();
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    if (session.status === 'ready' || session.status === 'no-role') route(paths.home(), true);
  }, [session.status, route]);

  async function submit(e: Event) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await server().auth.signIn(email, password);
      } else {
        await server().auth.resetPassword(email);
        setSentTo(email.trim());
      }
    } catch (err) {
      setError(signInErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="screen auth-screen">
      <h1 class="auth-title">HSE Audit</h1>
      <p class="auth-subtitle">Health &amp; Safety inspection checklist</p>
      <form class="panel auth-panel" onSubmit={submit}>
        <div class="panel-head">
          <h2>{mode === 'signin' ? 'Sign in' : 'Reset password'}</h2>
        </div>
        <div class="panel-body">
          <div class="field">
            <label for="auth-email">Email</label>
            <input id="auth-email" type="email" autocomplete="email" inputMode="email" required value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
          </div>
          {mode === 'signin' && (
            <div class="field">
              <label for="auth-password">Password</label>
              <input id="auth-password" type="password" autocomplete="current-password" required value={password} onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)} />
            </div>
          )}
          {error && (
            <p class="auth-error" role="alert">
              {error}
            </p>
          )}
          {sentTo && mode === 'forgot' && (
            <p class="auth-note" role="status">
              Reset link sent to {sentTo}. Open it on this phone to choose a new password.
            </p>
          )}
          {!online && (
            <p class="auth-note" role="status">
              Signing in needs a connection. Connect to Wi-Fi or mobile data and try again.
            </p>
          )}
          <button type="submit" class="btn btn-primary btn-block" disabled={busy || !online}>
            {mode === 'signin' ? (busy ? 'Signing in…' : 'Sign in') : busy ? 'Sending…' : 'Send reset link'}
          </button>
          <button
            type="button"
            class="btn btn-quiet btn-block"
            onClick={() => {
              setMode(mode === 'signin' ? 'forgot' : 'signin');
              setError('');
              setSentTo('');
            }}
          >
            {mode === 'signin' ? 'Forgot password?' : 'Back to sign in'}
          </button>
        </div>
        <p class="panel-note">Accounts are by invitation. Ask an admin on your team if you do not have one.</p>
      </form>
    </main>
  );
}
