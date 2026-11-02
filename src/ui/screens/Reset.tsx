import { useLocation } from 'preact-iso';
import { useState } from 'preact/hooks';
import { refreshSession, sessionStore } from '../../auth/session';
import { server } from '../../server';
import { useStore } from '../hooks/useStore';
import { paths } from '../paths';
import { signInErrorText } from './SignIn';
import { MIN_PASSWORD } from './Welcome';

/** Opened from the reset email (also the "send sign-in link" path): a new password, plus a name when none is set. */
export function Reset() {
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
            <p>This link has expired or was already used. Request a new one from the sign-in screen.</p>
            <a href={paths.signIn()} class="btn btn-primary btn-block">
              Go to sign in
            </a>
          </div>
        </section>
      </main>
    );
  }

  const needsName = session.status === 'ready' && !session.me.fullName;

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
      if (needsName && name.trim()) await server().auth.updateName(name.trim());
      await refreshSession();
      route(paths.home(), true);
    } catch (err) {
      setError(signInErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="screen auth-screen">
      <h1 class="auth-title">New password</h1>
      <form class="panel auth-panel" onSubmit={submit}>
        <div class="panel-body">
          {needsName && (
            <div class="field">
              <label for="reset-name">Full name</label>
              <input id="reset-name" type="text" autocomplete="name" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
            </div>
          )}
          <div class="field">
            <label for="reset-password">New password</label>
            <input id="reset-password" type="password" autocomplete="new-password" required minLength={MIN_PASSWORD} value={password} onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)} />
          </div>
          {error && (
            <p class="auth-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" class="btn btn-primary btn-block" disabled={busy || session.status === 'loading'}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </div>
      </form>
    </main>
  );
}
