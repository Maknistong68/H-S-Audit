# HSE Audit — collaborative Supabase backend: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-phone HSE Audit PWA into a team app: sign-in, shared audits on the existing "Audit Dashboard" Supabase project, offline-first sync with live updates, photos in Storage, an admin Team screen.

**Architecture:** Dexie stays the store every screen reads through `repo.ts`; every write now also appends a field-level patch to an `outbox` table in the same transaction. A `sync` engine pushes patches through the SQL function `hs_apply`, pulls rows by `server_at`, and merges live rows from Realtime broadcast channels with per-field last-write-wins. A `Remote` interface has a Supabase implementation and an in-memory fake used by all end-to-end tests.

**Tech Stack:** Vite 8 + Preact 10 + TypeScript strict, Dexie 4, `@supabase/supabase-js` 2.118 (new), Supabase Postgres 17 / Auth / Storage / Realtime (broadcast from database), one Deno Edge Function, Vitest + fake-indexeddb, Playwright (Pixel 7).

**Spec:** `docs/superpowers/specs/2026-11-02-hse-audit-collaborative-supabase-design.md`

## Global Constraints

- Supabase project id `bqkgfjmestbbvhtslrmc` (URL `https://bqkgfjmestbbvhtslrmc.supabase.co`); publishable key `sb_publishable_9S43p0GVLlnzLp0ATMOrFQ_hf8xaB0H`. Nothing of the dashboard's existing tables, functions, policies or triggers is altered.
- New server objects are prefixed `hs_`; the only exceptions are policies on `realtime.messages` and `storage.objects` and the bucket `hs-photos`.
- Roles are the dashboard's `app_role` enum: `viewer` reads, `auditor` / `lead` / `admin` write, `admin` manages the team. `public.app_role()` is the only role source in SQL.
- Phone timestamps (`updated_at`, `field_at` values, `created_at`, `deleted_at`, `uploaded_at`, `last_export_at`) are epoch **milliseconds** as `bigint`; `server_at` is `timestamptz`.
- `field_at` keys are the server column names everywhere, including inside Dexie rows (`fieldAt`).
- Soft deletes only: no SQL `DELETE`, no delete policies. Nothing in Dexie is dropped; schema versions only add.
- Only new runtime dependency: `@supabase/supabase-js@2.118.0` (exact pin, as the other dependencies are pinned).
- The fake remote is included only when the app is built with `VITE_FAKE_REMOTE=1`; production builds never contain fake users.
- Commit after every task with the attribution lines the session requires; run `npm run typecheck`, `npm test` and the relevant Playwright spec with real exit codes before each commit (`cmd > log; code=$?`).
- All user-facing copy: sentence case, verbs first on buttons ("Sign in", "Invite", "Upload"), no "OK"/"Submit".

## Review Focus

1. A phone with queued changes where someone else signs in: the queue is pushed under the new account and the audit shows that person as editor. Test in Task 4 (`push.test.ts`, "pushes as the account signed in at push time").
2. A role revoked while an audit is open: push stops with a visible problem, nothing queued is lost, and restoring the role resumes. Test in Task 4 (`push.test.ts`, "permission error keeps the queue and reports").
3. A teammate deletes the audit you have open: the screen says so and offers the way home instead of showing a stale form. Test in Task 9 (`collab.spec.ts`, "deleted by a teammate while open").
4. A phone whose clock is behind: its edits must not be discarded as "older" than what it has already seen. Test in Task 1 (`merge.test.ts`, "nextAt never goes below a seen field timestamp").
5. Inviting an email that is already a member or already invited: the admin gets a clear "already a member" / "send sign-in link" path, not a failure. Test in Task 11 (`team.spec.ts`, "inviting an existing member offers a sign-in link").

---

## File structure

```
supabase/
  migrations/2026110201_hs_tables.sql        tables, indexes, server_at trigger, RLS policies
  migrations/2026110202_hs_apply.sql         hs_apply(jsonb) and its allowed-field lists
  migrations/2026110203_hs_realtime.sql      hs_broadcast trigger, realtime.messages policies
  migrations/2026110204_hs_storage.sql       bucket hs-photos and storage.objects policies
  migrations/2026110205_hs_directory.sql     hs_team_directory(), hs_contractors(), log_event trigger on hs_audits
  functions/invite-user/index.ts             Edge Function
  README.md                                  how the SQL is applied and the manual Auth step
src/server/
  env.ts            VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_FAKE_REMOTE
  errors.ts         RemoteError { kind }
  rows.ts           server row types + toRemote/toLocal converters + rowKey()
  remote.ts         Remote and RemoteAuth interfaces, Member, Contractor, PresenceState
  fakeRemote.ts     in-memory Remote + RemoteAuth (tests only)
  supabase.ts       createClient
  supabaseRemote.ts Remote over supabase-js
  supabaseAuth.ts   RemoteAuth over supabase-js
  index.ts          picks fake or Supabase; exports `remote`, `auth`
src/sync/
  types.ts          Change, OutboxEntry, SyncTable
  merge.ts          applyChange, mergeRows, nextAt (pure)
  writer.ts         current writer (id, role) and ReadOnlyError
  outbox.ts         writeChange, writePhoto, pendingFor, pendingCounts, applyIncoming
  push.ts           drain outbox
  pull.ts           incremental pull + directory/contractors refresh
  photos.ts         ensurePhoto, ensurePhotos
  status.ts         sync status store
  engine.ts         wiring: online/offline/visibility/auth, channels, presence
  uploadLocal.ts    listLocalOnly, uploadAudit
src/auth/
  session.ts        session store (loading | signed-out | no-role | ready)
  AuthGate.tsx
src/ui/hooks/useStore.ts
src/ui/components/SyncPill.tsx, Presence.tsx
src/ui/screens/SignIn.tsx, Welcome.tsx, Reset.tsx, NoRole.tsx, Team.tsx
tests/e2e/fixtures.ts                        `test` with a pre-signed fake session
```

Modified: `src/db/db.ts` (v3), `src/db/repo.ts` (writes through outbox; new methods), `src/db/snapshots.ts`, `src/db/backup.ts`, `src/app.tsx`, `src/main.tsx`, `src/ui/paths.ts`, `src/ui/screens/{Home,AuditHeader,Walk,Findings,Score,Export,Settings}.tsx`, `src/ui/components/{ItemCard,MediaStrip,PhotoButton,TopBar}.tsx`, `src/export/excel.ts`, `playwright.config.ts`, `package.json`, `.env.example`, all `tests/e2e/*.spec.ts` (fixture import).

---

### Task 1: Change model, merge rules, Dexie v3, row converters

**Files:**
- Create: `src/sync/types.ts`, `src/sync/merge.ts`, `src/server/rows.ts`
- Modify: `src/db/db.ts`
- Test: `tests/unit/merge.test.ts`, `tests/unit/rows.test.ts`, `tests/unit/db-upgrade.test.ts`

**Interfaces:**
- Produces (`src/sync/types.ts`):
  ```ts
  export type SyncTable = 'hs_audits' | 'hs_answers' | 'hs_positives' | 'hs_photos';
  export interface Change { table: SyncTable; key: Record<string, string>; fields: Record<string, unknown>; at: number }
  export interface OutboxEntry { seq?: number; kind: 'patch' | 'photo'; table: SyncTable; key: string; auditId: string; change: Change; attempts: number; lastError?: string }
  export type RemoteRow = Record<string, unknown> & { updated_at: number; field_at: Record<string, number>; server_at?: string }
  ```
- Produces (`src/sync/merge.ts`):
  ```ts
  export function applyChange(row: RemoteRow | undefined, change: Change, by: string): { row: RemoteRow; applied: string[]; skipped: string[] }
  export function mergeRows(local: RemoteRow | undefined, incoming: RemoteRow, pending: Change[]): RemoteRow
  export function nextAt(now: number, row: RemoteRow | undefined, fields: string[]): number
  ```
  `applyChange` is the `hs_apply` rule (spec 3.4): a field is applied when `change.at > (row.field_at[field] ?? 0)`; applied fields get `field_at[field] = at`; `updated_at = max(updated_at, at)`; `updated_by = by` when anything applied; a missing row is created with every field at `at`. `mergeRows` takes each field from whichever side has the newer `field_at`, then re-applies each pending change through `applyChange`. `nextAt` returns `max(now, max(row.field_at[f] for f in fields) + 1)`.
- Produces (`src/server/rows.ts`): `HsAuditRow`, `HsAnswerRow`, `HsPositiveRow`, `HsPhotoRow` (snake_case, exactly the spec 3.2 columns); `HEADER_COLUMN: Record<keyof AuditHeader, string>` (`contractorWo→contractor_wo`, `projectName→project_name`, `auditors→auditors`, `auditDate→audit_date`, `auditNo→audit_no`, `contactNumber→contact_number`); `auditToRemote(a: Audit): HsAuditRow`, `auditToLocal(r: HsAuditRow, prev?: Audit): Audit`, same pairs for `Answer`/`HsAnswerRow`, `Positive`/`HsPositiveRow`, `MediaRow`/`HsPhotoRow` (thumb ArrayBuffer ↔ base64 string via `toBase64`/`fromBase64` exported from the same file); `rowKey(table: SyncTable, key: Record<string,string>): string` → `hs_answers:<audit_id>:<item_id>`, otherwise `<table>:<id>`; `keyOf(table, localRow): Record<string,string>`.
- Produces (`src/db/db.ts` v3): `Audit` gains `createdBy?`, `updatedBy?`, `fieldAt?: Record<string, number>`, `serverAt?: string`, `deletedAt?: number`, `contractorId?: string`, `localOnly?: boolean`, `activityAt?: number`, `activityBy?: string`; `Answer`, `Positive` gain `updatedBy?`, `fieldAt?`, `serverAt?`; `MediaRow` gains `createdBy?`, `storagePath?`, `uploadedAt?`, `updatedAt?`, `fieldAt?`, `serverAt?`; new tables `outbox: '++seq, key, auditId'` (`OutboxEntry`), `members: 'id'` (`export interface Member { id: string; email: string; fullName: string | null; role: Role | null; confirmed: boolean }`), `contractors: 'id'` (`export interface Contractor { id: string; name: string; contractNo?: string }`); `export type Role = 'viewer' | 'auditor' | 'lead' | 'admin'`; audits store adds index `deletedAt`. `Member`, `Contractor` and `Role` are defined once here and imported everywhere else. The v3 upgrade sets `localOnly = true` on every existing audit.

- [ ] **Step 1: Write the failing merge tests**

`tests/unit/merge.test.ts`:
```ts
test('applyChange creates a row with every field at `at`', () => {
  const { row, applied } = applyChange(undefined, { table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'full', note: '' }, at: 10 }, 'u1');
  expect(row).toMatchObject({ audit_id: 'a', item_id: 'A1', result: 'full', note: '', updated_at: 10, updated_by: 'u1', field_at: { result: 10, note: 10 } });
  expect(applied).toEqual(['result', 'note']);
});
test('applyChange keeps a newer field and applies an older one per field', () => {
  const base = applyChange(undefined, { table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'full', note: 'x' }, at: 10 }, 'u1').row;
  const { row, applied, skipped } = applyChange(base, { table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'no', note: 'older' }, at: 5 }, 'u2');
  expect(row.result).toBe('full'); expect(row.note).toBe('x'); expect(skipped).toEqual(['result', 'note']); expect(applied).toEqual([]);
  expect(row.updated_by).toBe('u1');
  const later = applyChange(base, { table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { note: 'newer' }, at: 11 }, 'u2').row;
  expect(later).toMatchObject({ result: 'full', note: 'newer', updated_at: 11, updated_by: 'u2', field_at: { result: 10, note: 11 } });
});
test('applyChange is idempotent', ...) // applying the same change twice equals applying it once
test('mergeRows takes each field from the newer side, then re-applies newer pending patches', () => {
  const local = { result: 'partial', note: 'mine', updated_at: 20, field_at: { result: 20, note: 20 } } as RemoteRow;
  const incoming = { result: 'no', note: 'theirs', updated_at: 25, field_at: { result: 25, note: 15 }, server_at: '2026-11-02T10:00:00Z' } as RemoteRow;
  const merged = mergeRows(local, incoming, [{ table: 'hs_answers', key: {}, fields: { note: 'pending' }, at: 30 }]);
  expect(merged).toMatchObject({ result: 'no', note: 'pending', updated_at: 30, field_at: { result: 25, note: 30 }, server_at: '2026-11-02T10:00:00Z' });
});
test('mergeRows with no local row returns the incoming row', ...)
test('nextAt never goes below a seen field timestamp', () => {
  const row = { updated_at: 500, field_at: { note: 500, result: 100 } } as RemoteRow;
  expect(nextAt(100, row, ['note'])).toBe(501);
  expect(nextAt(900, row, ['note'])).toBe(900);
  expect(nextAt(100, undefined, ['note'])).toBe(100);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/merge.test.ts`
Expected: FAIL, module `src/sync/merge` not found.

- [ ] **Step 3: Implement `src/sync/types.ts` and `src/sync/merge.ts`** with the signatures above. `applyChange` copies `change.key` into the row on create and never overwrites key fields.

- [ ] **Step 4: Run the merge tests**

Run: `npx vitest run tests/unit/merge.test.ts` → PASS.

- [ ] **Step 5: Write the failing row-converter tests**

`tests/unit/rows.test.ts`:
```ts
test('audit round-trips through the server shape', () => {
  const audit: Audit = { id: 'a', templateVersion: 'book2-2026-10', status: 'draft', header: { contractorWo: 'WO', projectName: 'P', auditors: 'J', auditDate: '2026-11-02', auditNo: 'HSSEW-006', contactNumber: '055' }, createdAt: 1, updatedAt: 2, fieldAt: { audit_no: 2 }, createdBy: 'u1', contractorId: '4800001322' };
  const r = auditToRemote(audit);
  expect(r).toMatchObject({ id: 'a', audit_no: 'HSSEW-006', contractor_wo: 'WO', audit_date: '2026-11-02', template_version: 'book2-2026-10', created_at: 1, updated_at: 2, field_at: { audit_no: 2 }, contractor_id: '4800001322', deleted_at: null, last_export_at: null });
  expect(auditToLocal(r)).toEqual({ ...audit, deletedAt: undefined, lastExportAt: undefined, updatedBy: undefined, serverAt: undefined });
});
test('an empty audit date becomes null and comes back as an empty string', ...)
test('photo thumb goes to base64 and back', () => { ... expect(fromBase64(toBase64(buf))).toEqual(buf) ...; expect(photoToRemote(row).thumb).toMatch(/^[A-Za-z0-9+/=]+$/) })
test('rowKey and keyOf agree', () => {
  expect(rowKey('hs_answers', { audit_id: 'a', item_id: 'B9.1' })).toBe('hs_answers:a:B9.1');
  expect(rowKey('hs_audits', { id: 'a' })).toBe('hs_audits:a');
  expect(keyOf('hs_answers', { id: 'a:B9.1', auditId: 'a', itemId: 'B9.1' } as Answer)).toEqual({ audit_id: 'a', item_id: 'B9.1' });
});
```

- [ ] **Step 6: Run to verify failure, implement `src/server/rows.ts`, run to verify pass.** Local `Answer.id` stays `<auditId>:<itemId>`; `answerToLocal` builds it with `answerId()`.

- [ ] **Step 7: Write the failing upgrade test**

`tests/unit/db-upgrade.test.ts`: open a raw Dexie v2 database named `hs-audit` with the v2 stores, put one audit, close; then import `src/db/db` and open; expect `db.audits.get(id)` to have `localOnly: true`, `db.outbox.count()` to be 0, `db.members`, `db.contractors` to exist, and `db.verno` to be 3.

- [ ] **Step 8: Run (fails), add version 3 to `src/db/db.ts` with the new stores, fields and upgrade, run (passes).**

- [ ] **Step 9: Run the whole unit suite and typecheck**

Run: `npm run typecheck && npm test` → both exit 0 (existing tests untouched).

- [ ] **Step 10: Commit** — `git add src/sync src/server/rows.ts src/db/db.ts tests/unit/{merge,rows,db-upgrade}.test.ts` + commit "Add the change model, merge rules and Dexie v3".

---

### Task 2: Outbox and the repository on top of it

**Files:**
- Create: `src/sync/writer.ts`, `src/sync/outbox.ts`
- Modify: `src/db/repo.ts`, `src/db/snapshots.ts`
- Test: `tests/unit/outbox.test.ts`, `tests/unit/repo.test.ts` (update), `tests/unit/snapshots.test.ts` (update where `updatedAt` was asserted)

**Interfaces:**
- Consumes: Task 1.
- Produces (`src/sync/writer.ts`):
  ```ts
  export interface Writer { id: string; role: Role | null }
  export class ReadOnlyError extends Error {}   // message 'This account can view audits but not edit them'
  export function setWriter(w: Writer | null): void
  export function getWriter(): Writer | null      // tests default to { id: 'local', role: 'auditor' } via setup.ts
  export const canEdit = (role: Role | null | undefined) => role === 'auditor' || role === 'lead' || role === 'admin'
  export const isAdmin = (role: Role | null | undefined) => role === 'admin'
  ```
- Produces (`src/sync/outbox.ts`):
  ```ts
  export async function writeChange(change: Omit<Change, 'at'> & { at?: number }): Promise<void>
  // one rw transaction over the target table, outbox, audits: at = nextAt(Date.now(), toRemote(current), fields);
  // applyChange → put toLocal(row); outbox.add({ kind:'patch', table, key: rowKey(), auditId, change, attempts: 0 });
  // audits.activityAt = at, activityBy = writer.id. Throws ReadOnlyError unless canEdit(getWriter()?.role) (null writer counts as editable, for imports before sign-in).
  export async function writePhoto(row: MediaRow, data: ArrayBuffer): Promise<void>   // media + mediaBlobs + outbox { kind: 'photo' } whose change.fields is the full HsPhotoRow minus sync columns, uploaded_at: null
  export async function pendingFor(key: string): Promise<Change[]>                    // by seq
  export async function pendingCounts(): Promise<{ total: number; byAudit: Map<string, number> }>
  export async function applyIncoming(table: SyncTable, row: RemoteRow): Promise<void> // mergeRows(local, row, pendingFor(key)) → put; bumps activityAt/activityBy from row.updated_at/updated_by when newer
  export async function removeEntries(seqs: number[]): Promise<void>
  export async function failEntries(seqs: number[], error: string): Promise<void>   // attempts++, lastError
  ```
- Produces (`src/db/repo.ts`, API kept; changes and additions):
  - Every mutation goes through `writeChange`/`writePhoto`; `touch()` is removed (activityAt replaces it). `createAudit` sends the full row create (fields: all header columns, `status`, `template_version`, `created_at`).
  - `listAudits(opts: { filter?: 'all' | 'mine' | 'archived' | 'deleted'; me?: string })` → `AuditSummary` gains `activityAt: number`, `activityBy?: string`, `pending: number`. `'all'` = not archived, not deleted; `'mine'` = all ∧ `createdBy === me`; `'archived'` = status archived, not deleted; `'deleted'` = `deletedAt` set. Sorted by `activityAt` desc.
  - `purgeAudit` is replaced by `deleteAudit(id, typedAuditNo)` (same typed-word check, writes `{ deleted_at: now }`, deletes local `mediaBlobs` of the audit) and `restoreAudit(id)` (`{ deleted_at: null }`).
  - `markExported` writes `{ last_export_at }`; `setStatus` writes `{ status }`; `updateHeader` maps keys with `HEADER_COLUMN` and also accepts `contractorId` → `contractor_id`.
  - New: `memberName(id: string): Promise<string>` (fullName, else email, else 'Someone'), `listMembers()`, `listContractors()`, `getMedia` falls back to the thumb when the full bytes are absent and returns `{ ...row, data, fromThumb: boolean }` (`Media` gains `fromThumb?: boolean`).
  - Tag methods stay as they are (unused by screens).
- `src/db/snapshots.ts`: `restoreSnapshot` writes the differences as changes (`updateHeader`-style header patch, per answer `{ result, note, flagged, repeated }`, per positive `{ text, position, deleted_at }`, per photo `{ deleted_at }`) instead of raw puts; `snapshotIfDirty` compares `activityAt ?? updatedAt`.

- [ ] **Step 1: Write the failing outbox tests**

`tests/unit/outbox.test.ts` (uses `db` with `beforeEach` delete/open as `repo.test.ts` does):
```ts
test('writeChange updates the row and queues one entry with the same at', async () => {
  await writeChange({ table: 'hs_audits', key: { id: 'a' }, fields: { audit_no: 'X', status: 'draft', template_version: 'book2-2026-10', created_at: 1 } });
  await writeChange({ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'full' } });
  const entries = await db.outbox.orderBy('seq').toArray();
  expect(entries.map((e) => e.key)).toEqual(['hs_audits:a', 'hs_answers:a:A1']);
  const answer = await db.answers.get('a:A1');
  expect(answer).toMatchObject({ result: 'full', fieldAt: { result: entries[1].change.at } });
  expect((await db.audits.get('a'))!.activityAt).toBe(entries[1].change.at);
});
test('a viewer cannot write', async () => { setWriter({ id: 'v', role: 'viewer' }); await expect(writeChange({...})).rejects.toBeInstanceOf(ReadOnlyError); expect(await db.outbox.count()).toBe(0); });
test('applyIncoming keeps newer pending fields on top of the server row', ...) // local note at 30 pending, incoming note at 20 + result at 40 → note 'pending', result incoming
test('pendingCounts groups by audit', ...)
test('writePhoto queues a photo entry whose fields carry the base64 thumb and uploaded_at null', ...)
```

- [ ] **Step 2: Run (fails), add `tests/unit/setup.ts` line `setWriter({ id: 'local', role: 'auditor' })`, implement `writer.ts` and `outbox.ts`, run (passes).**

- [ ] **Step 3: Update `tests/unit/repo.test.ts`** for the new behaviour: `purgeAudit` → `deleteAudit` (the wrong-word check still throws; after a right-word delete the audit is absent from `listAudits()` and present in `listAudits({ filter: 'deleted' })`; `restoreAudit` brings it back); `listAudits({ filter: 'mine', me })` filters by `createdBy`; every write leaves an outbox entry (`db.outbox.count()` grows); `updatedAt` assertions become `activityAt`. Add: `getMedia` returns `fromThumb: true` when the blob is missing but a thumb exists.

- [ ] **Step 4: Rewrite `src/db/repo.ts` on `writeChange`/`writePhoto`; adjust `snapshots.ts`.** `createAudit` sets `createdBy = getWriter()?.id`. Run: `npx vitest run tests/unit/repo.test.ts tests/unit/snapshots.test.ts tests/unit/backup.test.ts` → PASS (fix `backup.test.ts` expectations only where they asserted `updatedAt` bumps).

- [ ] **Step 5: Full gate** — `npm run typecheck && npm test` exit 0. The e2e suite is expected to still pass (no UI change yet): `npx playwright test > e2e.log; echo $?` → 0.

- [ ] **Step 6: Commit** "Route every write through the outbox".

---

### Task 3: Remote interface, fake remote and fake auth

**Files:**
- Create: `src/server/errors.ts`, `src/server/remote.ts`, `src/server/fakeRemote.ts`, `src/server/index.ts`, `src/server/env.ts`
- Test: `tests/unit/fakeRemote.test.ts`

**Interfaces:**
- Produces (`src/server/errors.ts`): `export class RemoteError extends Error { constructor(public kind: 'network' | 'permission' | 'validation' | 'auth' | 'unknown', message: string) }`.
- Produces (`src/server/remote.ts`):
  ```ts
  import type { Member, Contractor, Role } from '../db/db';   // defined in Task 1
  export interface PresenceState { userId: string; name: string; itemId: string | null; at: number }
  export interface ChannelHandlers { onRow(table: SyncTable, row: RemoteRow): void; onPresence?(others: PresenceState[]): void; onStatus(status: 'subscribed' | 'closed' | 'error'): void }
  export interface Remote {
    apply(changes: Change[]): Promise<{ applied: number; skipped: number }>;
    pull(table: SyncTable, sinceServerAt: string | null, limit: number): Promise<RemoteRow[]>;   // ascending server_at
    uploadPhoto(path: string, data: ArrayBuffer): Promise<void>;                                 // a 409 duplicate counts as success
    downloadPhoto(path: string): Promise<ArrayBuffer>;
    directory(): Promise<Member[]>;
    contractors(): Promise<Contractor[]>;
    subscribe(topic: string, handlers: ChannelHandlers, presence?: PresenceState): () => void;
    track(topic: string, presence: PresenceState): void;
  }
  export interface Session { userId: string; email: string }
  export interface RemoteAuth {
    session(): Promise<Session | null>;
    onChange(cb: (s: Session | null) => void): () => void;
    signIn(email: string, password: string): Promise<void>;
    signOut(): Promise<void>;
    resetPassword(email: string): Promise<void>;            // sends the email; redirect to <origin>/reset
    updatePassword(password: string): Promise<void>;
    updateName(fullName: string): Promise<void>;            // auth metadata + profiles.full_name
    me(): Promise<Member | null>;                           // own profile row; null when no profile/role
    invite(email: string, role: Role): Promise<'invited' | 'exists'>;
    setRole(userId: string, role: Role | null): Promise<void>;
    listInvites(): Promise<{ email: string; role: Role; createdAt: string }[]>;
  }
  ```
- Produces (`src/server/env.ts`): `export const env = { url, key, fake: import.meta.env.VITE_FAKE_REMOTE === '1' }`, `export function serverConfigured(): boolean`.
- Produces (`src/server/index.ts`): `export async function loadServer(): Promise<{ remote: Remote; auth: RemoteAuth }>` — dynamic import of `./fakeRemote` when `env.fake`, else of `./supabaseRemote` + `./supabaseAuth` (Task 5); `export function server(): { remote; auth }` after load (throws before).
- Produces (`src/server/fakeRemote.ts`): `export function createFake(): { remote: Remote; auth: RemoteAuth; control: FakeControl }` where
  ```ts
  export interface FakeControl {
    setOnline(online: boolean): void;                           // offline: every Remote/auth network call rejects RemoteError('network')
    teammate(by: string, changes: Change[]): void;              // applies as another user and broadcasts
    rows(table: SyncTable): RemoteRow[];
    uploaded(): string[];                                       // storage paths
    setRole(userId: string, role: Role | null): void;
    failNextApplyWith(kind: RemoteError['kind']): void;
    putPhoto(path: string, data: ArrayBuffer): void;             // seeds storage so downloadPhoto works for teammate photos
  }
  ```
  Users: `admin@test` (admin, "Ada Admin"), `auditor@test` (auditor, "Ola Auditor"), `lead@test` (lead, "Lee Lead"), `viewer@test` (viewer, "Vic Viewer"), `invited@test` (invited, no profile → `me()` null); password `test1234` for all. A wrong password rejects with `RemoteError('auth', 'Invalid login credentials')`, the same message Supabase returns. `server_at` is an increasing ISO string per applied change. `window.__hsFake = control` and a session is pre-signed when `localStorage['hs:fakeSession']` holds one of the emails. `apply` uses `applyChange` from Task 1 with the signed-in user id; it throws `RemoteError('permission')` for viewers and `RemoteError('auth')` when signed out. `subscribe` delivers rows for topic `audit:<id>` (and `team:audits` for `hs_audits`) synchronously after each apply.

- [ ] **Step 1: Write the failing fake tests**

`tests/unit/fakeRemote.test.ts`:
```ts
test('apply then pull returns rows in server_at order and respects field timestamps', async () => {
  const { remote, auth } = createFake(); await auth.signIn('auditor@test', 'test1234');
  await remote.apply([{ table: 'hs_audits', key: { id: 'a' }, fields: { audit_no: 'X', status: 'draft', template_version: 't', created_at: 1 }, at: 10 }]);
  await remote.apply([{ table: 'hs_audits', key: { id: 'a' }, fields: { audit_no: 'OLD' }, at: 5 }]);
  const rows = await remote.pull('hs_audits', null, 100);
  expect(rows).toHaveLength(1); expect(rows[0].audit_no).toBe('X'); expect(rows[0].updated_by).toBe((await auth.session())!.userId);
  expect(await remote.pull('hs_audits', rows[0].server_at!, 100)).toEqual([]);
});
test('viewers cannot apply; signed-out callers get an auth error', ...)
test('offline rejects with a network error and comes back', ...)
test('subscribe delivers teammate changes for the audit topic and the team topic', ...)
test('invite returns exists for a known email and invited for a new one; the new user can then sign in after accept', ...)
```

- [ ] **Step 2: Run (fails), implement `errors.ts`, `remote.ts`, `env.ts`, `fakeRemote.ts`, `index.ts`, run (passes).**

- [ ] **Step 3: `npm run typecheck && npm test` exit 0. Commit** "Add the remote interface and an in-memory fake".

---

### Task 4: Push, pull, photos, status and the engine

**Files:**
- Create: `src/sync/push.ts`, `src/sync/pull.ts`, `src/sync/photos.ts`, `src/sync/status.ts`, `src/sync/engine.ts`, `src/ui/hooks/useStore.ts`
- Test: `tests/unit/push.test.ts`, `tests/unit/pull.test.ts`, `tests/unit/photos.test.ts`, `tests/unit/engine.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`createFake()` as the remote in tests).
- Produces (`src/sync/status.ts`):
  ```ts
  export type SyncStatus = { kind: 'offline'; pending: number } | { kind: 'syncing'; pending: number } | { kind: 'synced'; pending: 0; at: number } | { kind: 'problem'; pending: number; message: string };
  export const syncStatus: Store<SyncStatus>;   // from createStore
  export function createStore<T>(initial: T): Store<T>   // { get(); set(v); subscribe(cb): () => void }
  ```
  `src/ui/hooks/useStore.ts`: `export function useStore<T>(store: Store<T>): T` (useState + useEffect subscribe).
- Produces (`src/sync/push.ts`): `export async function pushOnce(remote: Remote, opts: { batch?: number }): Promise<{ sent: number; left: number }>`: reads up to `batch` (default 200) entries by seq; consecutive `patch` entries become one `remote.apply`; a `photo` entry first `uploadPhoto(storage_path, blob)` then `apply([{ ...change, fields: { ...change.fields, uploaded_at: Date.now() } }])` and sets the local `media.uploadedAt`; on success `removeEntries`. Errors: `network` → rethrow (caller backs off); `permission`/`auth` → `failEntries` + rethrow; `validation` → `failEntries` on that batch, skip it, continue, and return `{ ..., left }` with the failure recorded (the status layer shows "n changes could not be sent").
  `export function backoffMs(attempt: number): number` → `min(60_000, 2_000 * 2 ** attempt)`.
- Produces (`src/sync/pull.ts`): `export async function pullOnce(remote: Remote): Promise<number>` (rows applied): per table reads cursor `settings['sync:cursor:<table>']`, fetches pages of 1000 by `server_at`, `applyIncoming` each, stores cursor = newest `server_at` minus 60 s (ISO); then `members` and `contractors` refreshed from `remote.directory()`/`remote.contractors()`; sets `settings['sync:lastPullAt']`.
  `export function cursorFrom(newestServerAt: string): string` (minus 60 s).
- Produces (`src/sync/photos.ts`): `export async function ensurePhoto(remote: Remote, id: string): Promise<boolean>` (true when bytes are now local; downloads `storagePath` into `mediaBlobs` when missing and `uploadedAt` set); `export async function ensurePhotos(remote: Remote, auditId: string, onProgress?: (done: number, total: number) => void): Promise<{ missing: string[] }>`.
- Produces (`src/sync/engine.ts`):
  ```ts
  export function startEngine(deps: { remote: Remote; auth: RemoteAuth; win: Window }): Engine
  export interface Engine {
    requestPush(): void;            // debounced 500 ms; retries with backoffMs on network errors while navigator.onLine
    pullNow(): Promise<void>;
    openAudit(auditId: string): void;   // subscribes audit:<id>; a pull runs after 'subscribed'
    closeAudit(): void;
    watchList(): () => void;        // subscribes team:audits while Home is open
    setPresence(itemId: string | null): void;
    presence: Store<PresenceState[]>;   // others in the open audit
    deletedAudit: Store<string | null>; // id of the open audit when an incoming row sets deleted_at
    stop(): void;
  }
  export const engine: { current: Engine | null }
  ```
  Status transitions: offline when `!navigator.onLine` or a network error; syncing while a push or pull runs; synced after a push with `left === 0` and a pull; problem on permission/auth/validation. `online`, `visibilitychange` (visible) and auth changes trigger pull + push; a 5-minute interval pulls while visible. `writeChange` notifies the engine through `outbox.onWrite(cb)` (add `export function onWrite(cb: () => void): () => void` to `outbox.ts`).

- [ ] **Step 1: Write the failing push tests**

`tests/unit/push.test.ts` (fake remote, signed in as `auditor@test`):
```ts
test('batches consecutive patches into one apply and clears the queue', ...) // 3 writes → applySpy called once with 3 changes; outbox empty; fake rows updated
test('uploads a photo before its row and marks uploadedAt locally', ...)      // control.uploaded() contains '<audit>/<id>.jpg'; fake hs_photos row uploaded_at set; media.uploadedAt set
test('a network error keeps the queue and rethrows', ...)                     // control.setOnline(false)
test('permission error keeps the queue and reports', ...)                     // control.setRole(auditorId, 'viewer') → rejects RemoteError permission; entries attempts=1 lastError set; queue intact; restoring the role then pushOnce succeeds
test('pushes as the account signed in at push time', ...)                     // write as auditor, signOut, signIn lead, push → fake row updated_by is lead's id
test('a validation error skips that batch, keeps later entries flowing and reports', ...) // control.failNextApplyWith('validation'); two batches (patches, then a photo) → first batch entries have lastError, photo still uploaded
test('backoffMs doubles from 2 s and caps at 60 s', () => { expect(backoffMs(0)).toBe(2000); expect(backoffMs(3)).toBe(16000); expect(backoffMs(10)).toBe(60000); });
```
The local `media.uploadedAt` after a photo upload is a direct `db.media.update` (plus `fieldAt.uploaded_at`), never `writeChange`, so it does not queue again.

- [ ] **Step 2: Run (fails), implement `status.ts`, `useStore.ts`, `push.ts`, run (passes).**

- [ ] **Step 3: Write the failing pull/photos tests**

`tests/unit/pull.test.ts`:
```ts
test('first pull loads everything and stores a cursor 60 s behind the newest row', ...)
test('second pull applies only newer rows and keeps newer pending local fields', ...)
test('pull refreshes members and contractors', ...)
test('cursorFrom subtracts 60 seconds', () => expect(cursorFrom('2026-11-02T10:01:00.000Z')).toBe('2026-11-02T10:00:00.000Z'));
```
`tests/unit/photos.test.ts`: `ensurePhoto` downloads a missing blob once and is a no-op when present; `ensurePhotos` reports photos that are not uploaded yet as missing and reports progress `(1,2)`, `(2,2)`.

- [ ] **Step 4: Run (fails), implement `pull.ts`, `photos.ts`, run (passes).**

- [ ] **Step 5: Write the failing engine tests**

`tests/unit/engine.test.ts` with a stub `Window` (event target with `navigator.onLine` toggled by the test):
```ts
test('a local write leads to a push and the status ends synced', ...)
test('going offline sets offline and coming back pushes and pulls', ...)
test('openAudit receives a teammate change live and setPresence is tracked', ...)
test('an incoming deleted_at on the open audit sets deletedAudit', ...)
```

- [ ] **Step 6: Run (fails), implement `engine.ts` and `outbox.onWrite`, run (passes). `npm run typecheck && npm test` exit 0. Commit** "Add push, pull, photo fetch and the sync engine".

---

### Task 5: Supabase remote and auth

**Files:**
- Create: `src/server/supabase.ts`, `src/server/supabaseRemote.ts`, `src/server/supabaseAuth.ts`, `.env.example`
- Modify: `package.json` (add `@supabase/supabase-js: "2.118.0"`), `src/server/index.ts` (wire the real pair)
- Test: `tests/unit/supabaseRemote.test.ts` (pure helpers only)

**Interfaces:**
- Consumes: Task 3 interfaces.
- Produces (`src/server/supabase.ts`): `export const supabase = createClient(env.url, env.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`.
- Produces (`src/server/supabaseRemote.ts`): `export function createSupabaseRemote(client: SupabaseClient): Remote` plus exported pure helpers `toRpcChanges(changes: Change[]): unknown` (the `hs_apply` argument: `[{ table, key, fields, at }]`), `rowFromBroadcast(payload: { operation: string; table: string; record: Record<string, unknown> }): { table: SyncTable; row: RemoteRow } | null`, `classify(error: { code?: string; status?: number; message: string }): RemoteError` (`PGRST301`/`401` → auth, `42501`/`403` → permission, `P0001` or `22P02` → validation, `TypeError: Failed to fetch`/status 0 → network). `pull` = `client.from(table).select('*').gt('server_at', since).order('server_at').limit(limit)`; `apply` = `client.rpc('hs_apply', { changes })`; `uploadPhoto` = `client.storage.from('hs-photos').upload(path, new Blob([data], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: false })` treating `statusCode 409` as success; `downloadPhoto` = `.download(path)`; `directory` = `client.rpc('hs_team_directory')`; `contractors` = `client.rpc('hs_contractors')`; `subscribe` = `client.channel(topic, { config: { private: true, presence: { key: userId } } })` with `.on('broadcast', { event: 'INSERT' | 'UPDATE' }, …)`, `.on('presence', { event: 'sync' }, …)`, `.subscribe(status => …)`, after `await client.realtime.setAuth()`.
- Produces (`src/server/supabaseAuth.ts`): `export function createSupabaseAuth(client): RemoteAuth` — `signIn` = `signInWithPassword`; `resetPassword(email)` = `resetPasswordForEmail(email, { redirectTo: `${location.origin}${BASE}/reset` })`; `updatePassword` = `updateUser({ password })`; `updateName` = `updateUser({ data: { full_name } })` + `from('profiles').update({ full_name }).eq('id', uid)`; `me()` = `from('profiles').select('id,email,full_name,role').eq('id', uid).maybeSingle()` → `Member`; `invite` = `client.functions.invoke('invite-user', { body: { email, role } })` → `'invited' | 'exists'`; `setRole` = `from('profiles').update({ role }).eq('id', userId)` (also `from('invites').update({ role })` when role is not null); `listInvites` = `from('invites').select('email,role,created_at')`.
- `.env.example`:
  ```
  VITE_SUPABASE_URL=https://bqkgfjmestbbvhtslrmc.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
  # VITE_FAKE_REMOTE=1   # in-memory server for tests
  ```

- [ ] **Step 1: `npm install --save-exact @supabase/supabase-js@2.118.0`** and commit the lockfile change with the rest of this task.

- [ ] **Step 2: Write the failing helper tests**

`tests/unit/supabaseRemote.test.ts`: `toRpcChanges` passes `table/key/fields/at` through untouched; `rowFromBroadcast` maps `{ operation: 'UPDATE', table: 'hs_answers', record }` to `{ table: 'hs_answers', row: record }` and returns null for an unknown table; `classify` maps the four cases above.

- [ ] **Step 3: Run (fails), implement the three files, run (passes).** `npm run typecheck` exit 0 (the real remote is only type-checked here; the live check is Task 12).

- [ ] **Step 4: Commit** "Add the Supabase remote and auth adapters".

---

### Task 6: SQL migrations on the Audit Dashboard project

**Files:**
- Create: `supabase/migrations/2026110201_hs_tables.sql`, `2026110202_hs_apply.sql`, `2026110203_hs_realtime.sql`, `2026110204_hs_storage.sql`, `2026110205_hs_directory.sql`, `supabase/README.md`

**Interfaces:**
- Produces, used by Task 5's remote: tables of spec 3.2; `public.hs_apply(changes jsonb) returns jsonb` (`{"applied": n, "skipped": m}`); `public.hs_team_directory()`; `public.hs_contractors() returns table (id text, name text, contract_no text)` reading `contractors.doc->>'name'`, `doc->>'contractNo'`, `security definer`, any role; topics `audit:<id>` and `team:audits`; bucket `hs-photos`.

- [ ] **Step 1: Write `2026110201_hs_tables.sql`** exactly as spec 3.2 (four tables, indexes, `hs_set_server_at()` trigger function + `before insert or update` triggers, `enable row level security`, the policies of spec 3.3, `grant select, insert, update on … to authenticated`).

- [ ] **Step 2: Write `2026110202_hs_apply.sql`**: `hs_apply(changes jsonb) returns jsonb language plpgsql security invoker set search_path = public`. Algorithm (the executor writes it from here): loop over `jsonb_array_elements(changes)`; validate `table` against the four names and `fields` keys against the per-table allowed list (`hs_audits`: audit_no, contractor_wo, project_name, auditors, audit_date, contact_number, contractor_id, status, template_version, last_export_at, deleted_at, created_at; `hs_answers`: result, note, flagged, repeated; `hs_positives`: audit_id, text, position, deleted_at, created_at; `hs_photos`: audit_id, owner_kind, owner_id, mime, bytes, width, height, thumb, storage_path, uploaded_at, deleted_at, created_at), raising `exception using errcode = 'P0001'` otherwise; `select … for update` by key; when missing, `insert` via `jsonb_populate_record(null::<table>, key || fields || sync columns)`; when present, build the new row with a per-field comparison against `field_at`; `update` only when at least one field applied; count applied/skipped. Use dynamic SQL with `format('%I')` for the table name only.

- [ ] **Step 3: Write `2026110203_hs_realtime.sql`**: `hs_broadcast()` trigger function (`security definer`) calling `realtime.broadcast_changes` with topic `'audit:' || coalesce(new.audit_id, new.id)::text`, and for `hs_audits` a second call with topic `'team:audits'`; `after insert or update` triggers on the four tables; the two `realtime.messages` policies of spec 3.5.

- [ ] **Step 4: Write `2026110204_hs_storage.sql`**: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('hs-photos', 'hs-photos', false, 10485760, array['image/jpeg']) on conflict do nothing;` and the two `storage.objects` policies of spec 3.7.

- [ ] **Step 5: Write `2026110205_hs_directory.sql`**: `hs_team_directory()` (`security definer`, `set search_path = ''`, returns id, email, full_name, role, `confirmed` = `email_confirmed_at is not null` from `auth.users`, guarded by `if public.app_role() is null then raise exception 'not a team member' using errcode = '42501'`), `hs_contractors()`, and `create trigger hs_audits_log after insert or update on public.hs_audits for each row execute function public.log_event()`.

- [ ] **Step 6: Apply each file in order with `mcp__Supabase__apply_migration`** (`project_id: bqkgfjmestbbvhtslrmc`, `name` = the file's snake_case stem). Expected: each returns success; `mcp__Supabase__list_tables` shows the four `hs_` tables with `rls_enabled: true`.

- [ ] **Step 7: Verify the SQL behaviour with `mcp__Supabase__execute_sql`** as the existing admin user (read their id with `select id from profiles where role = 'admin' limit 1`), inside one script that ends in `rollback`:
  ```sql
  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '<admin id>', 'role', 'authenticated')::text, true);
  select hs_apply('[{"table":"hs_audits","key":{"id":"00000000-0000-0000-0000-000000000001"},"fields":{"audit_no":"T1","status":"draft","template_version":"t","created_at":1},"at":10}]'::jsonb);  -- {"applied":1,"skipped":0}
  select hs_apply('[{"table":"hs_audits","key":{"id":"00000000-0000-0000-0000-000000000001"},"fields":{"audit_no":"OLD"},"at":5}]'::jsonb);           -- {"applied":0,"skipped":1}
  select audit_no, updated_at, field_at from hs_audits where id = '00000000-0000-0000-0000-000000000001';                                                -- T1, 10, {"audit_no":10,...}
  select hs_apply('[{"table":"hs_audits","key":{"id":"00000000-0000-0000-0000-000000000001"},"fields":{"nope":1},"at":11}]'::jsonb);                   -- raises P0001
  rollback;
  ```
  Then the same with a made-up `sub` (no profile) expecting the first `hs_apply` to fail with `42501`/RLS, and `select * from hs_team_directory()` as the admin returning the existing profiles. Run `mcp__Supabase__get_advisors` (security): no new errors for `hs_` objects.

- [ ] **Step 8: Write `supabase/README.md`**: how the migrations were applied (MCP / `supabase db push`), the manual Auth redirect step (spec 3.9) with the exact dashboard path, and that `Allow public access` in Realtime settings is not required because every channel is private.

- [ ] **Step 9: Commit** "Add the hs_ schema, hs_apply, realtime, storage and directory migrations".

---

### Task 7: Edge Function `invite-user`

**Files:**
- Create: `supabase/functions/invite-user/index.ts`, `supabase/functions/invite-user/deno.json`

**Interfaces:**
- Produces: `POST /functions/v1/invite-user` body `{ email: string; role: 'viewer' | 'auditor' | 'lead' | 'admin' }` → `200 { status: 'invited' | 'exists' }`, `403 { error: 'admin only' }`, `400 { error }`. `ALLOWED_ORIGINS = ['https://hse-audit-nine.vercel.app', 'http://localhost:5173', 'http://localhost:4173']`; `redirectTo = <origin or ALLOWED_ORIGINS[0]>/welcome`.

- [ ] **Step 1: Write the function.** Caller client: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization')! } } })`, `from('profiles').select('role').eq('id', (await auth.getUser()).data.user.id).single()` must be `admin`. Admin client: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`; `from('invites').upsert({ email, role, invited_by })`; `auth.admin.inviteUserByEmail(email, { redirectTo })`; an error whose message contains `already been registered` → `{ status: 'exists' }`. CORS headers for the allowed origins; `OPTIONS` returns 204.

- [ ] **Step 2: Deploy with `mcp__Supabase__deploy_edge_function`** (`name: invite-user`, `verify_jwt: true`, files: `index.ts`, `deno.json`). Expected: listed by `mcp__Supabase__list_edge_functions` with status ACTIVE.

- [ ] **Step 3: Smoke-test from this session**: `curl -s -X POST https://bqkgfjmestbbvhtslrmc.supabase.co/functions/v1/invite-user -H "apikey: <publishable>" -H "Content-Type: application/json" -d '{"email":"x@example.com","role":"viewer"}'` → 401 (no JWT). The admin-path test happens in Task 12's live check.

- [ ] **Step 4: Commit** "Add the invite-user Edge Function".

---

### Task 8: Session, AuthGate, sign-in screens and app wiring

**Files:**
- Create: `src/auth/session.ts`, `src/auth/AuthGate.tsx`, `src/ui/screens/SignIn.tsx`, `src/ui/screens/Welcome.tsx`, `src/ui/screens/Reset.tsx`, `src/ui/screens/NoRole.tsx`, `tests/e2e/fixtures.ts`
- Modify: `src/ui/paths.ts` (routes `signIn: /sign-in`, `welcome: /welcome`, `reset: /reset`, `team: /team` under `BASE`), `src/app.tsx`, `src/main.tsx`, `playwright.config.ts`, every `tests/e2e/*.spec.ts`
- Test: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `server()`/`loadServer()` (Task 3/5), `startEngine` (Task 4), `setWriter` (Task 2).
- Produces (`src/auth/session.ts`):
  ```ts
  export type SessionState = { status: 'loading' } | { status: 'signed-out' } | { status: 'no-role'; email: string } | { status: 'ready'; me: Member };
  export const sessionStore: Store<SessionState>;
  export async function startSession(auth: RemoteAuth): Promise<void>   // session() → me() (falls back to settings['auth:me'] when offline) → store; onChange keeps it current; calls setWriter({ id, role }) and caches me in settings['auth:me']
  ```
- Produces (`src/auth/AuthGate.tsx`): `export function AuthGate(props: { children: ComponentChildren })` — renders `SignIn`/`Welcome`/`Reset` for their paths whatever the state; otherwise `loading` → a blank screen with the app title, `signed-out` → redirects to `/sign-in`, `no-role` → `<NoRole email />`, `ready` → children. After a successful sign-in the app goes to Home.
- Copy: a `RemoteError` of kind `auth` on the sign-in form reads "Email or password is not right"; kind `network` reads "No connection. Signing in needs a connection."; any other kind shows the error's message. When `!serverConfigured() && !env.fake` it renders "This build has no server configured" (developer message).
- `src/main.tsx`: `const { remote, auth } = await loadServer(); engine.current = startEngine({ remote, auth, win: window }); await startSession(auth); render(…)`.
- Screens: `SignIn` (labels "Email", "Password"; buttons "Sign in", link "Forgot password?" → shows an email field + "Send reset link"; inline error text from `RemoteError.message`; offline note "Signing in needs a connection" when `!navigator.onLine`); `Welcome` (after supabase processes the invite URL the session exists; fields "Full name", "Password"; button "Save and continue" → `updateName`, `updatePassword`, route home); `Reset` ("New password", and "Full name" when `me().fullName` is null; button "Save password"); `NoRole` (text "Your account is not in the team yet. Ask an admin to invite <email>."; button "Sign out").
- `tests/e2e/fixtures.ts`: `export const test = base.extend({ context: async ({ context }, use) => { await context.addInitScript(() => localStorage.setItem('hs:fakeSession', 'auditor@test')); await use(context); } })`; `export { expect }`. A helper `export async function signInAs(page, email)` that clears the key, signs out and signs in through the form.
- `playwright.config.ts`: webServer command `VITE_FAKE_REMOTE=1 npm run build && npm run preview`.

- [ ] **Step 1: Write the failing e2e**

`tests/e2e/auth.spec.ts` (imports `@playwright/test` directly, no pre-signed session):
```ts
test('shows sign in, rejects a wrong password, signs in and out', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel('Email').fill('auditor@test'); await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is not right')).toBeVisible();
  await page.getByLabel('Password').fill('test1234'); await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible();
  await page.goto('./settings'); await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});
test('an invited account without a role sees the not-in-team screen', ...)   // invited@test → text 'not in the team yet', button 'Sign out'
test('signing in needs a connection', ...)                                   // context.setOffline(true) → note visible, Sign in disabled
```

- [ ] **Step 2: Run `npx playwright test tests/e2e/auth.spec.ts` (fails: no sign-in route).**

- [ ] **Step 3: Implement session, gate, screens, routes, main wiring; switch every existing spec to `import { test, expect } from './fixtures'`; Settings gets a temporary "Sign out" button (Task 11 finishes that panel).**

- [ ] **Step 4: Run `npx playwright test > e2e.log; echo $?`** → 0 (all existing specs pass under the pre-signed fake session, plus auth.spec). `npm run typecheck && npm test` exit 0.

- [ ] **Step 5: Commit** "Add sign-in, the session gate and the fake test session".

---

### Task 9: Home, sync pill, upload of local audits, backup import

**Files:**
- Create: `src/ui/components/SyncPill.tsx`, `src/sync/uploadLocal.ts`
- Modify: `src/ui/screens/Home.tsx`, `src/ui/components/TopBar.tsx` (no API change; Home passes `right`), `src/db/backup.ts`, `src/styles/components.css`
- Test: `tests/unit/uploadLocal.test.ts`, `tests/e2e/home.spec.ts` (update), `tests/e2e/collab.spec.ts`, `tests/e2e/offline-sync.spec.ts`

**Interfaces:**
- Produces (`src/sync/uploadLocal.ts`): `export async function listLocalOnly(): Promise<Audit[]>`; `export async function uploadAudit(id: string): Promise<void>` — enqueues a full-row create for the audit (`at = audit.updatedAt`), each answer, each positive, each photo (`writePhoto`-style entries using the existing blob) and clears `localOnly`, all in one transaction; `export async function uploadAllLocal(): Promise<number>`.
- `importBackup` writes the new audit with `localOnly: true` then calls `uploadAudit(auditId)`.
- `SyncPill`: reads `syncStatus`; text "Offline" / "Syncing (n)" / "Up to date" / "Problem"; `role="status"`; tapping "Problem" shows the message in a toast.
- Home: filters as segmented buttons "All" / "Mine" / "Archived" (+ "Deleted" for admins); search box labelled "Search audits" matching audit no or project; rows show `Edited by <name> · <relativeTime>` (name from `repo.memberName`, "you" for self) and "n changes waiting" when `pending > 0`; "Delete for the team…" replaces "Purge…" and uses `repo.deleteAudit`; Deleted rows get "Restore"; the upload card "N audits on this phone are not in the team yet" with button "Upload" → `uploadAllLocal()` then toast "Uploaded". `engine.current.watchList()` while mounted.

- [ ] **Step 1: Write the failing unit test** `tests/unit/uploadLocal.test.ts`: an audit put directly into Dexie with `localOnly: true`, one answer, one photo with blob → `uploadAudit` leaves outbox entries `[hs_audits create, hs_answers, photo]` in that order with `uploaded_at: null` on the photo and `localOnly` false; `listLocalOnly()` is then empty. `importBackup` of a zip built by `buildBackup` leaves the imported audit with outbox entries.

- [ ] **Step 2: Run (fails), implement `uploadLocal.ts` and the `backup.ts` change, run (passes).**

- [ ] **Step 3: Write the failing e2e**

`tests/e2e/collab.spec.ts` (fixtures; two contexts: the second signed in as `lead@test` through `signInAs`):
```ts
test('two phones on one audit see each other live', async ({ browser }) => {
  // phone A creates audit HSSEW-010 and answers A1 = No with note 'Plan outdated'
  // phone B opens Home, sees HSSEW-010 with 'Edited by Ola Auditor', opens the walk, sees A1 No and the note without reloading
  // phone B taps Full on A2; phone A sees A2 Full within 2 s and the card says 'Edited by Lee Lead'
});
test('deleted by a teammate while open', async ({ browser }) => {
  // A has the walk open; B deletes the audit for the team; A sees 'This audit was deleted by Lee Lead' with a 'Back to audits' link
});
```
`tests/e2e/offline-sync.spec.ts`:
```ts
test('edits made offline reach the server when back online', async ({ page }) => {
  // create audit; page.evaluate(() => window.__hsFake.setOnline(false)) + dispatch 'offline'; answer three questions
  // pill shows 'Offline' and the audit row '3 changes waiting'; setOnline(true) + dispatch 'online'
  // pill goes 'Syncing' then 'Up to date'; window.__hsFake.rows('hs_answers') has the three results
});
test('audits already on the phone can be uploaded', ...)  // seed a localOnly audit through IndexedDB before load → card visible → Upload → card gone, fake rows contain it
```
Update `home.spec.ts`: "Purge…" → "Delete for the team…", "Purge permanently" → "Delete for the team"; the deleted audit is hidden from All and listed under Deleted when signed in as admin.

- [ ] **Step 4: Run (fails), implement Home, SyncPill, styles; run `npx playwright test tests/e2e/home.spec.ts tests/e2e/collab.spec.ts tests/e2e/offline-sync.spec.ts` → pass.**

- [ ] **Step 5: Full gate (`typecheck`, `test`, full `playwright test`) exit 0. Commit** "Team audit list, sync status and upload of local audits".

---

### Task 10: Audit screens: presence, editor, read-only, photo badge and download, contractor picker, export step

**Files:**
- Create: `src/ui/components/Presence.tsx`, `src/ui/hooks/useAuditChannel.ts`
- Modify: `src/ui/screens/{Walk,Findings,Score,Export,AuditHeader}.tsx`, `src/ui/components/{ItemCard,MediaStrip,PhotoButton,PositiveList}.tsx`, `src/export/excel.ts`, `src/styles/{walk,media,components}.css`
- Test: `tests/e2e/presence.spec.ts`, `tests/e2e/viewer.spec.ts`, `tests/e2e/media.spec.ts` (update), `tests/e2e/export.spec.ts` (update), `tests/unit/excel.test.ts` (unchanged)

**Interfaces:**
- `useAuditChannel(auditId: string, expandedId: string | null)`: calls `engine.current.openAudit` on mount, `closeAudit` on unmount, `setPresence(expandedId)` on change; returns `{ others: PresenceState[]; deletedBy: string | null }`.
- `Presence({ others })`: up to 4 initials chips (`title` = full name), `aria-label="Also in this audit: <names>"`.
- `ItemCard` props gain `editedBy?: { name: string; at: number }` (rendered as `Edited by <name> · <relativeTime>` under the result control) and `readOnly?: boolean` (result control, note, flag, repeated, ready text, photo and dictate disabled; a line "Read-only account" at the top of the open card); `WalkRow` items get `here?: string` (name) rendered as a small "<name> is here" marker.
- `MediaStrip`: a thumb whose row has no `uploadedAt` and a pending outbox entry shows a "Waiting to upload" badge (`aria-label`); opening a photo with no local bytes calls `ensurePhoto(remote, id)` and shows "Downloading photo…" until it resolves; `fromThumb` data shows "Low-resolution copy".
- `AuditHeader`: a `<select id="hdr-contractor">` labelled "Contractor" listing `repo.listContractors()` (option text `<id> — <name>`), on change `repo.updateHeader(id, { contractorId, contractorWo: `${id}-${name}` })`.
- `exportExcel(auditId, opts?: { onProgress?(done, total): void })` calls `ensurePhotos(server().remote, auditId, onProgress)` first and returns `{ bytes, filename, missingPhotos: number }`; Export shows "Downloading n photos…" on the button while it runs and toasts "n photos were not available offline; thumbnails were used" when `missingPhotos > 0`.
- `relativeTime` moves from `Export.tsx` to `src/domain/time.ts` (exported, reused by Home and ItemCard).

- [ ] **Step 1: Write the failing e2e**

`tests/e2e/presence.spec.ts`: two contexts in one audit; B opens question B1.1; A sees the chip with initials "LL" (`Also in this audit: Lee Lead`) and the row marker "Lee Lead is here"; A's open card for a question B answered shows "Edited by Lee Lead".
`tests/e2e/viewer.spec.ts`: `signInAs(page, 'viewer@test')`; the walk shows "Read-only account"; "Full" is disabled; the note field is disabled; Export Excel still works (download event).
`media.spec.ts` additions: after adding a photo the thumb has `aria-label` "Waiting to upload" while `__hsFake.setOnline(false)`, and loses it after `setOnline(true)`; a photo added by a teammate (`__hsFake.teammate(...)` with a real base64 thumb and uploaded storage path) opens with "Downloading photo…" then shows the full image.
`export.spec.ts` addition: with a teammate photo not yet downloaded the export button reads "Downloading 1 photo…" at some point and the resulting workbook has one `xl/media/` entry.
AuditHeader addition in `home.spec.ts`: choosing contractor "4800001322" fills "Contractor / WO" with `4800001322-<name>`.

- [ ] **Step 2: Run (fails), implement, run the four specs (pass).**

- [ ] **Step 3: Full gate exit 0. Commit** "Presence, editor names, read-only mode, photo sync in the audit screens".

---

### Task 11: Team screen and account settings

**Files:**
- Create: `src/ui/screens/Team.tsx`
- Modify: `src/ui/screens/Settings.tsx`, `src/app.tsx` (route), `src/ui/paths.ts` (already has `team`)
- Test: `tests/e2e/team.spec.ts`, `tests/e2e/settings-desk.spec.ts` (update)

**Interfaces:**
- Settings "Account" panel: name (editable, saved on blur through `auth.updateName`), email, role label ("Viewer (read-only)", "Auditor", "Lead", "Admin"), button "Sign out", link "Manage team" for admins; the Storage note changes to "Audits are shared with the team and kept on this device for offline use."
- Team (admins; others are redirected home): "Invite" form (label "Email", select "Role" default auditor, button "Invite"); result text "Invitation sent to <email>" or, for `'exists'`, "<email> is already a member. Send them a sign-in link?" with a button "Send sign-in link" (`auth.resetPassword(email)`, then "Sign-in link sent"); member list (name, email, role select saved through `auth.setRole`, button "Remove access" → role null, confirm sheet); "Pending invitations" list from `listInvites()` minus confirmed members, each with "Send sign-in link"; a note under the form: "Invite and reset links open the app only when https://hse-audit-nine.vercel.app/** is in the Supabase Auth redirect list."

- [ ] **Step 1: Write the failing e2e**

`tests/e2e/team.spec.ts` (`signInAs(page, 'admin@test')`):
```ts
test('admin invites a new auditor and changes a role', ...)                  // invite new@test → 'Invitation sent to new@test'; member row 'Vic Viewer' role select → 'auditor' → __hsFake rows show role auditor
test('inviting an existing member offers a sign-in link', ...)                // invite auditor@test → 'already a member' → 'Send sign-in link' → 'Sign-in link sent'
test('non-admins do not get the Team screen', ...)                            // auditor goes to /team → redirected to Home; Settings has no 'Manage team'
```

- [ ] **Step 2: Run (fails), implement, run (passes). Full gate exit 0. Commit** "Team screen and account settings".

---

### Task 12: Deployment, live check, documentation

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-11-02-hse-audit-collaborative-supabase-design.md` (only if something shipped differently), `vercel.json` (unchanged unless needed)

- [ ] **Step 1: Vercel env** with `mcp__Vercel__create_project_env` on `prj_FyNgYvfZ7mRldNeetMBOJLRN9Cv3` (team `team_7mKhMku8uw0FZIBAiQLsu3Vx`): `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, type `plain`, targets production + preview + development. Expected: `mcp__Vercel__filter_project_envs` lists both.

- [ ] **Step 2: README** — sign-in, team, offline behaviour, the manual redirect-URL step, local dev with `.env.local`, tests (`VITE_FAKE_REMOTE=1` is set by the Playwright config).

- [ ] **Step 3: Full gate** — `npm run typecheck`, `npm test`, `npx playwright test` all exit 0; `npm run build` (no `VITE_FAKE_REMOTE`) succeeds and `grep -r "auditor@test" dist/assets` finds nothing.

- [ ] **Step 4: Commit and push** `ccr-78d2f6ac-bl7a2o`; wait for the Vercel deployment of the pushed SHA to be READY (`mcp__Vercel__list_deployments`).

- [ ] **Step 5: Create a throw-away test account on the real project.** With `mcp__Supabase__execute_sql`: `insert into public.invites (email, role) values ('hs-livecheck@example.com', 'auditor')`. Then, from a Node script in the scratchpad using `@supabase/supabase-js` with the publishable key, `auth.signUp({ email: 'hs-livecheck@example.com', password: <random 16 chars> })`. Expected: a user row appears (`select id from auth.users where email = 'hs-livecheck@example.com'`) and the trigger created `profiles` with role auditor. Confirm the email by SQL: `update auth.users set email_confirmed_at = now() where email = 'hs-livecheck@example.com'`. If the project refuses sign-ups ("Signups not allowed"), skip to Step 7 and say so in the report.

- [ ] **Step 6: Live run.** A Playwright script (Pixel 7, scratchpad) against `https://hse-audit-nine.vercel.app`: sign in as the test account; create an audit `LIVE-<timestamp>`; answer A1 = No with a note; add `tests/fixtures/photo.jpg`; wait for the pill to read "Up to date". Verify with SQL: one `hs_audits` row with that `audit_no`, one `hs_answers` row `result = 'no'`, one `hs_photos` row with `uploaded_at` set, one `storage.objects` row in `hs-photos`, and `realtime.messages` rows with topic `audit:<id>`. Open the same audit in a second context as the same account: the answer and the photo thumbnail appear. Call the deployed `invite-user` function with the test account's access token → `403 { error: 'admin only' }` (the function's own gate works). Export the Excel from the live site and check `R155` carries `vm=`.

- [ ] **Step 7: Clean up and report.** SQL: delete the test account's `hs_` rows, its `storage.objects`, `profiles`, `invites` row and finally `delete from auth.users where email = 'hs-livecheck@example.com'`. Report to the user: live URL; the two things only they can do (add the redirect URLs; sign in with their dashboard admin account and invite the team from Settings → Manage team); exactly what Step 6 verified live and anything skipped.

---

## Self-review notes

- Spec coverage: 3.2–3.7 → Task 6; 3.8 → Task 7; 3.9 → Tasks 6 (README), 11 (note), 12; 4.1–4.3 → Tasks 1–4; 4.4 → Tasks 4, 10; 4.5 → Tasks 8, 10 (read-only), 9 (pill); 4.6 → Task 10; 4.7 → Tasks 2, 9; 5.1–5.3 → Task 8; 5.4 → Task 9; 5.5–5.6 → Task 10; 5.7–5.8 → Task 11; 6 → Task 9; 7 → Task 10; 8 → every task; 9 → Tasks 5, 6, 7, 12; 10 → Review Focus tests.
- Names used consistently: `writeChange`, `writePhoto`, `applyIncoming`, `pendingFor`, `pendingCounts`, `applyChange`, `mergeRows`, `nextAt`, `rowKey`, `keyOf`, `createFake`, `FakeControl.setOnline/teammate/rows/uploaded/setRole`, `startEngine`, `engine.current`, `openAudit/closeAudit/watchList/setPresence`, `syncStatus`, `sessionStore`, `startSession`, `setWriter/getWriter/canEdit/isAdmin`, `ensurePhoto/ensurePhotos`, `uploadAudit/uploadAllLocal/listLocalOnly`, `deleteAudit/restoreAudit`, `memberName`, `listContractors`.
- Task 12 Step 5 states the limit of the live check honestly: a full two-account live test needs an account only the owner can create; the SQL and function paths are verified server-side.
