import { useLocation } from 'preact-iso';
import { useEffect, useState } from 'preact/hooks';
import { sessionStore } from '../../auth/session';
import type { Member, Role } from '../../db/db';
import { server } from '../../server';
import { isAdmin } from '../../sync/writer';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/toast';
import { TopBar } from '../components/TopBar';
import { useStore } from '../hooks/useStore';
import { paths } from '../paths';

const ROLES: { value: Role; label: string; article: string }[] = [
  { value: 'viewer', label: 'Viewer (read-only)', article: 'a viewer' },
  { value: 'auditor', label: 'Auditor', article: 'an auditor' },
  { value: 'lead', label: 'Lead', article: 'a lead' },
  { value: 'admin', label: 'Admin', article: 'an admin' },
];

const APP_ORIGIN = 'https://hse-audit-nine.vercel.app';

type Invite = { email: string; role: Role; createdAt: string };

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

/** Admins only: invite teammates, change roles, remove access, resend sign-in links. */
export function Team() {
  const { route } = useLocation();
  const session = useStore(sessionStore);
  const me = session.status === 'ready' ? session.me : null;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('auditor');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; linkFor?: string } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  useEffect(() => {
    if (session.status === 'ready' && !isAdmin(session.me.role)) route(paths.home(), true);
    if (session.status === 'signed-out' || session.status === 'no-role') route(paths.home(), true);
  }, [session, route]);

  async function load() {
    try {
      const [dir, inv] = await Promise.all([server().remote.directory(), server().auth.listInvites()]);
      setMembers(dir);
      setInvites(inv);
    } catch (err) {
      toast(errorText(err), { durationMs: 8000 });
    }
  }

  useEffect(() => {
    if (me && isAdmin(me.role)) void load();
  }, [me?.id, me?.role]);

  async function invite(e: Event) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await server().auth.invite(target, role);
      if (result === 'exists') setNotice({ text: `${target} is already a member. Send them a sign-in link?`, linkFor: target });
      else {
        setNotice({ text: `Invitation sent to ${target}. The email opens the app so they can choose a password.` });
        setEmail('');
      }
      await load();
    } catch (err) {
      setNotice({ text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function sendLink(target: string) {
    try {
      await server().auth.resetPassword(target);
      setNotice({ text: `Sign-in link sent to ${target}` });
    } catch (err) {
      setNotice({ text: errorText(err) });
    }
  }

  async function changeRole(m: Member, next: Role) {
    try {
      await server().auth.setRole(m.id, next);
      const label = ROLES.find((r) => r.value === next)!;
      setNotice({ text: `${m.fullName || m.email} is now ${label.article}` });
      await load();
    } catch (err) {
      setNotice({ text: errorText(err) });
    }
  }

  async function removeAccess() {
    if (!removing) return;
    const m = removing;
    setRemoving(null);
    try {
      await server().auth.setRole(m.id, null);
      setNotice({ text: `${m.fullName || m.email} no longer has access` });
      await load();
    } catch (err) {
      setNotice({ text: errorText(err) });
    }
  }

  const confirmedEmails = new Set((members ?? []).filter((m) => m.confirmed).map((m) => m.email));
  const pending = invites.filter((i) => !confirmedEmails.has(i.email));

  return (
    <>
      <TopBar title="Team" back={paths.settings()} />
      <main class="screen">
        <form class="panel" onSubmit={invite}>
          <div class="panel-head">
            <h2>Invite a teammate</h2>
          </div>
          <div class="panel-body field-grid">
            <div class="field span-2">
              <label for="team-email">Email</label>
              <input id="team-email" type="email" inputMode="email" autocomplete="off" required value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
            </div>
            <div class="field">
              <label for="team-role">Role</label>
              <select id="team-role" value={role} onChange={(e) => setRole((e.currentTarget as HTMLSelectElement).value as Role)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div class="field field-action">
              <button type="submit" class="btn btn-primary" disabled={busy}>
                {busy ? 'Inviting…' : 'Invite'}
              </button>
            </div>
          </div>
          {notice && (
            <div class="panel-body team-notice" role="status">
              <p>{notice.text}</p>
              {notice.linkFor && (
                <button type="button" class="btn btn-sm" onClick={() => void sendLink(notice.linkFor!)}>
                  Send sign-in link
                </button>
              )}
            </div>
          )}
          <p class="panel-note">
            Invite and reset links open the app only when <code>{APP_ORIGIN}/**</code> is in the Supabase Auth redirect list (Authentication → URL Configuration).
          </p>
        </form>

        <section class="panel">
          <div class="panel-head">
            <h2>Members</h2>
            {members && <span class="status-text">{members.filter((m) => m.role).length} with access</span>}
          </div>
          {members === null ? (
            <p class="empty">Loading…</p>
          ) : (
            <ul class="rows" aria-label="Members">
              {members.map((m) => {
                const name = m.fullName || m.email;
                return (
                  <li key={m.id} class="list-row team-row">
                    <div class="list-row-main">
                      <span class="list-row-title">{name}</span>
                      <span class="list-row-meta">
                        {m.email}
                        {!m.confirmed && ' · invitation not accepted yet'}
                        {m.id === me?.id && ' · you'}
                      </span>
                      {!m.role && <span class="status-text">No access</span>}
                    </div>
                    <div class="list-row-side team-side">
                      <select class="team-role" aria-label={`Role for ${name}`} value={m.role ?? ''} disabled={m.id === me?.id} onChange={(e) => void changeRole(m, (e.currentTarget as HTMLSelectElement).value as Role)}>
                        {!m.role && <option value="">Choose a role</option>}
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      {m.role && m.id !== me?.id && (
                        <button type="button" class="btn btn-sm btn-quiet" onClick={() => setRemoving(m)}>
                          Remove access
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Pending invitations</h2>
          </div>
          {pending.length === 0 ? (
            <p class="empty">Nobody is waiting to accept an invitation.</p>
          ) : (
            <ul class="rows" aria-label="Pending invitations">
              {pending.map((i) => (
                <li key={i.email} class="list-row">
                  <div class="list-row-main">
                    <span class="list-row-title">{i.email}</span>
                    <span class="list-row-meta">{ROLES.find((r) => r.value === i.role)?.label ?? i.role}</span>
                  </div>
                  <div class="list-row-side">
                    <button type="button" class="btn btn-sm" onClick={() => void sendLink(i.email)}>
                      Send sign-in link
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Sheet open={removing !== null} title="Remove access" onClose={() => setRemoving(null)}>
        <p>
          {removing?.fullName || removing?.email} will no longer be able to sign in. Their audits and edits stay with the team. You can give them a role again later.
        </p>
        <div class="actions-row">
          <button type="button" class="btn btn-danger btn-primary" onClick={() => void removeAccess()}>
            Remove access
          </button>
          <button type="button" class="btn btn-quiet" onClick={() => setRemoving(null)}>
            Keep access
          </button>
        </div>
      </Sheet>
    </>
  );
}
