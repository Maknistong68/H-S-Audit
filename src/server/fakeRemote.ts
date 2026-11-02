import type { Contractor, Member, Role } from '../db/db';
import { applyChange } from '../sync/merge';
import type { Change, RemoteRow, SyncTable } from '../sync/types';
import { canEdit } from '../sync/writer';
import { RemoteError, type RemoteErrorKind } from './errors';
import type { ChannelHandlers, PresenceState, Remote, RemoteAuth, Session } from './remote';
import { rowKey } from './rows';

/**
 * An in-memory server with the same rules as the real one (hs_apply, roles, topics), for unit and
 * end-to-end tests. Built into the app only with VITE_FAKE_REMOTE=1.
 */
export interface FakeControl {
  /** Offline: every network call rejects with RemoteError('network'). */
  setOnline(online: boolean): void;
  /** Applies changes as another member (email, its part before @, or id) and broadcasts them. */
  teammate(who: string, changes: Change[]): void;
  rows(table: SyncTable): RemoteRow[];
  /** Storage paths uploaded so far. */
  uploaded(): string[];
  setRole(userId: string, role: Role | null): void;
  failNextApplyWith(kind: RemoteErrorKind): void;
  /** Seeds storage so a teammate's photo can be downloaded. */
  putPhoto(path: string, data: ArrayBuffer): void;
  userId(email: string): string;
  /** The invited person sets a password and a name, as the welcome screen would. */
  acceptInvite(email: string, password: string, fullName: string): void;
  /** Emails that got a sign-in / reset link. */
  resets(): string[];
  /** Another member announces where they are (or leaves, with itemId null and the next call absent). */
  presence(who: string, topic: string, itemId: string | null): void;
}

interface FakeUser {
  id: string;
  email: string;
  password: string | null;
  fullName: string | null;
  role: Role | null;
  confirmed: boolean;
}

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const FAKE_PASSWORD = 'test1234';
export const FAKE_SESSION_KEY = 'hs:fakeSession';

const seedUsers = (): FakeUser[] => [
  { id: 'user-admin', email: 'admin@test', password: FAKE_PASSWORD, fullName: 'Ada Admin', role: 'admin', confirmed: true },
  { id: 'user-auditor', email: 'auditor@test', password: FAKE_PASSWORD, fullName: 'Ola Auditor', role: 'auditor', confirmed: true },
  { id: 'user-lead', email: 'lead@test', password: FAKE_PASSWORD, fullName: 'Lee Lead', role: 'lead', confirmed: true },
  { id: 'user-viewer', email: 'viewer@test', password: FAKE_PASSWORD, fullName: 'Vic Viewer', role: 'viewer', confirmed: true },
  { id: 'user-invited', email: 'invited@test', password: FAKE_PASSWORD, fullName: null, role: null, confirmed: false },
];

const CONTRACTORS: Contractor[] = [
  { id: '4800001322', name: 'AL FAHD CONTRACTING', contractNo: 'C-1322' },
  { id: '4800000838', name: 'ALPHA BUILDERS', contractNo: 'C-0838' },
];

/** The same lists hs_apply enforces on the server. */
export const ALLOWED_FIELDS: Record<SyncTable, string[]> = {
  hs_audits: ['audit_no', 'contractor_wo', 'project_name', 'auditors', 'audit_date', 'contact_number', 'contractor_id', 'status', 'template_version', 'last_export_at', 'deleted_at', 'created_at'],
  hs_answers: ['result', 'note', 'flagged', 'repeated'],
  hs_positives: ['audit_id', 'text', 'position', 'deleted_at', 'created_at'],
  hs_photos: ['audit_id', 'owner_kind', 'owner_id', 'mime', 'bytes', 'width', 'height', 'thumb', 'storage_path', 'uploaded_at', 'deleted_at', 'created_at'],
};

const TABLES = Object.keys(ALLOWED_FIELDS) as SyncTable[];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const BASE_CLOCK = Date.UTC(2026, 10, 2, 10, 0, 0);

export function createFake(opts: { storage?: Storage } = {}): { remote: Remote; auth: RemoteAuth; control: FakeControl } {
  const users = seedUsers();
  const tables: Record<SyncTable, Map<string, RemoteRow>> = { hs_audits: new Map(), hs_answers: new Map(), hs_positives: new Map(), hs_photos: new Map() };
  const files = new Map<string, ArrayBuffer>();
  const invites = new Map<string, { role: Role; createdAt: string }>();
  const subs = new Map<string, Set<{ handlers: ChannelHandlers; presence?: PresenceState }>>();
  const presence = new Map<string, Map<string, PresenceState>>();
  const authListeners = new Set<(s: Session | null) => void>();
  const resets: string[] = [];
  let online = true;
  let clock = 0;
  let failNext: RemoteErrorKind | null = null;
  let session: FakeUser | null = null;

  const stored = opts.storage?.getItem(FAKE_SESSION_KEY);
  if (stored) session = users.find((u) => u.email === stored) ?? null;

  const serverAt = () => new Date(BASE_CLOCK + ++clock).toISOString();
  const findUser = (who: string) => users.find((u) => u.id === who || u.email === who || u.email.split('@')[0] === who);
  const toMember = (u: FakeUser): Member => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role, confirmed: u.confirmed });
  const sessionOf = (u: FakeUser | null): Session | null => (u ? { userId: u.id, email: u.email } : null);

  function requireOnline(): void {
    if (!online) throw new RemoteError('network', 'Failed to fetch');
  }
  function requireSession(): FakeUser {
    requireOnline();
    if (!session) throw new RemoteError('auth', 'JWT expired');
    return session;
  }
  function requireEditor(): FakeUser {
    const u = requireSession();
    if (!u.confirmed || !canEdit(u.role)) throw new RemoteError('permission', 'new row violates row-level security policy');
    return u;
  }
  function requireAdmin(): FakeUser {
    const u = requireSession();
    if (u.role !== 'admin') throw new RemoteError('permission', 'admin only');
    return u;
  }

  function broadcast(topic: string, table: SyncTable, row: RemoteRow): void {
    for (const sub of subs.get(topic) ?? []) sub.handlers.onRow(table, clone(row));
  }

  function others(topic: string, selfId: string | undefined): PresenceState[] {
    return [...(presence.get(topic)?.values() ?? [])].filter((p) => p.userId !== selfId).map(clone);
  }
  function notifyPresence(topic: string): void {
    for (const sub of subs.get(topic) ?? []) sub.handlers.onPresence?.(others(topic, sub.presence?.userId ?? session?.id));
  }

  /** hs_apply: validate, merge per field, stamp server_at, broadcast. */
  function applyAs(userId: string, changes: Change[]): { applied: number; skipped: number } {
    let applied = 0;
    let skipped = 0;
    for (const change of changes) {
      if (!TABLES.includes(change.table)) throw new RemoteError('validation', `unknown table ${String(change.table)}`);
      for (const f of Object.keys(change.fields)) {
        if (!ALLOWED_FIELDS[change.table].includes(f)) throw new RemoteError('validation', `field ${f} is not allowed on ${change.table}`);
      }
    }
    for (const change of changes) {
      const key = rowKey(change.table, change.key);
      const existing = tables[change.table].get(key);
      const result = applyChange(existing, change, userId);
      applied += result.applied.length;
      skipped += result.skipped.length;
      if (!existing) {
        if (change.table !== 'hs_answers') result.row.created_by = userId;
        result.row.server_at = serverAt();
        tables[change.table].set(key, result.row);
      } else if (result.applied.length > 0) {
        result.row.server_at = serverAt();
        tables[change.table].set(key, result.row);
      } else {
        continue;
      }
      const row = tables[change.table].get(key)!;
      const auditId = change.table === 'hs_audits' ? String(row.id) : String(row.audit_id);
      broadcast(`audit:${auditId}`, change.table, row);
      if (change.table === 'hs_audits') broadcast('team:audits', change.table, row);
    }
    return { applied, skipped };
  }

  const remote: Remote = {
    async apply(changes) {
      const u = requireEditor();
      if (failNext) {
        const kind = failNext;
        failNext = null;
        throw new RemoteError(kind, `simulated ${kind} failure`);
      }
      return applyAs(u.id, changes);
    },
    async pull(table, since, limit) {
      requireSession();
      const rows = [...tables[table].values()].filter((r) => since === null || (r.server_at ?? '') > since).sort((a, b) => (a.server_at! < b.server_at! ? -1 : 1));
      return clone(rows.slice(0, limit));
    },
    async uploadPhoto(path, data) {
      requireEditor();
      if (!files.has(path)) files.set(path, data.slice(0));
    },
    async downloadPhoto(path) {
      requireSession();
      const data = files.get(path);
      if (!data) throw new RemoteError('validation', 'Object not found');
      return data.slice(0);
    },
    async directory() {
      requireSession();
      return users.map(toMember);
    },
    async contractors() {
      requireSession();
      return clone(CONTRACTORS);
    },
    subscribe(topic, handlers, mine) {
      const sub = { handlers, presence: mine };
      if (!subs.has(topic)) subs.set(topic, new Set());
      subs.get(topic)!.add(sub);
      handlers.onStatus('subscribed');
      if (mine) remote.track(topic, mine);
      else handlers.onPresence?.(others(topic, session?.id));
      return () => {
        subs.get(topic)?.delete(sub);
        if (mine) {
          presence.get(topic)?.delete(mine.userId);
          notifyPresence(topic);
        }
        handlers.onStatus('closed');
      };
    },
    track(topic, state) {
      if (!presence.has(topic)) presence.set(topic, new Map());
      presence.get(topic)!.set(state.userId, clone(state));
      notifyPresence(topic);
    },
  };

  function setSession(u: FakeUser | null): void {
    session = u;
    if (u) opts.storage?.setItem(FAKE_SESSION_KEY, u.email);
    else opts.storage?.removeItem(FAKE_SESSION_KEY);
    for (const cb of authListeners) cb(sessionOf(u));
  }

  const auth: RemoteAuth = {
    async session() {
      return sessionOf(session);
    },
    onChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signIn(email, password) {
      requireOnline();
      const u = users.find((x) => x.email === email.trim().toLowerCase());
      if (!u || u.password === null || u.password !== password) throw new RemoteError('auth', 'Invalid login credentials');
      setSession(u);
    },
    async signOut() {
      setSession(null);
    },
    async resetPassword(email) {
      requireOnline();
      resets.push(email.trim().toLowerCase());
    },
    async updatePassword(password) {
      requireSession().password = password;
    },
    async updateName(fullName) {
      requireSession().fullName = fullName;
    },
    async me() {
      requireOnline();
      return session ? toMember(session) : null;
    },
    async invite(email, role) {
      const admin = requireAdmin();
      const normalised = email.trim().toLowerCase();
      invites.set(normalised, { role, createdAt: new Date(BASE_CLOCK + ++clock).toISOString() });
      if (users.some((u) => u.email === normalised)) return 'exists';
      users.push({ id: `user-${users.length + 1}-${admin.id}`, email: normalised, password: null, fullName: null, role, confirmed: false });
      return 'invited';
    },
    async setRole(userId, role) {
      requireAdmin();
      const u = users.find((x) => x.id === userId);
      if (!u) throw new RemoteError('validation', 'no such member');
      u.role = role;
    },
    async listInvites() {
      requireAdmin();
      return [...invites.entries()].map(([email, i]) => ({ email, role: i.role, createdAt: i.createdAt }));
    },
  };

  const control: FakeControl = {
    setOnline: (v) => {
      online = v;
    },
    teammate: (who, changes) => {
      const u = findUser(who);
      if (!u) throw new Error(`no fake user ${who}`);
      applyAs(u.id, changes);
    },
    rows: (table) => clone([...tables[table].values()]),
    uploaded: () => [...files.keys()],
    setRole: (userId, role) => {
      const u = users.find((x) => x.id === userId);
      if (u) u.role = role;
    },
    failNextApplyWith: (kind) => {
      failNext = kind;
    },
    putPhoto: (path, data) => {
      files.set(path, data.slice(0));
    },
    userId: (email) => findUser(email)?.id ?? '',
    acceptInvite: (email, password, fullName) => {
      const u = findUser(email);
      if (!u) throw new Error(`no fake user ${email}`);
      u.password = password;
      u.fullName = fullName;
      u.confirmed = true;
      u.role = invites.get(u.email)?.role ?? u.role;
    },
    resets: () => [...resets],
    presence: (who, topic, itemId) => {
      const u = findUser(who);
      if (!u) throw new Error(`no fake user ${who}`);
      remote.track(topic, { userId: u.id, name: u.fullName ?? u.email, itemId, at: Date.now() });
    },
  };

  return { remote, auth, control };
}
