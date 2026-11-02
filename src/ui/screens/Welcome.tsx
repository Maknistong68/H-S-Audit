import { useLocation } from 'preact-iso';
import { useState } from 'preact/hooks';
import { refreshSession, sessionStore } from '../../auth/session';
import { server } from '../../server';
import { useStore } from '../hooks/useStore';
import { paths } from '../paths';
import { signInErrorText } from './SignIn';

export const MIN_PASSWORD = 8;

/** Opened from the invitation email: the new member picks a name and a password. */
export function Welcome() {
  const { route } = useLocation();
  const session = useStore(sessionStore);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (session.status === 'signed-out') {
    return (
      <main class="screen auth-screen">
        <h1 class="auth-title">HSE Audit</h1>
        <section class="panel auth-panel">
          <div class="panel-body">
            <p>This invitation link has expired or was already used. Ask an admin to send a new one, or sign in if you already have a password.</p>
            <a href={paths.signIn()} class="btn btn-primary btn-block">
              Go to sign in
            </a>
          </div>
        </section>
      </main>
    );
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await server().auth.updatePassword(password);
      if (name.trim()) await server().auth.updateName(name.trim());
      await refreshSession();
      route(paths.home(), true);
    } catch (err) {
      setError(signInErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const email = session.status === 'ready' ? session.me.email : session.status === 'no-role' ? session.email : '';

  return (
    <main class="screen auth-screen">
      <h1 class="auth-title">Welcome</h1>
      <p class="auth-subtitle">{email ? `You are joining the audit team as ${email}.` : 'Set up your account.'}</p>
      <form class="panel auth-panel" onSubmit={submit}>
        <div class="panel-body">
          <div class="field">
            <label for="welcome-name">Full name</label>
            <input id="welcome-name" type="text" autocomplete="name" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
          </div>
          <div class="field">
            <label for="welcome-password">Password</label>
            <input id="welcome-password" type="password" autocomplete="new-password" required minLength={MIN_PASSWORD} value={password} onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)} />
          </div>
          {error && (
            <p class="auth-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" class="btn btn-primary btn-block" disabled={busy || session.status === 'loading'}>
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </form>
    </main>
  );
}
