import { server } from '../../server';

/** Signed in, but not (yet) a member of the team: invited and unconfirmed, or access removed. */
export function NoRole({ email }: { email: string }) {
  return (
    <main class="screen auth-screen">
      <h1 class="auth-title">HSE Audit</h1>
      <section class="panel auth-panel">
        <div class="panel-head">
          <h2>Not in the team yet</h2>
        </div>
        <div class="panel-body">
          <p>
            Your account is not in the team yet. Ask an admin to invite <strong>{email}</strong>, or to restore your access, then sign in again.
          </p>
          <button type="button" class="btn btn-block" onClick={() => void server().auth.signOut()}>
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
