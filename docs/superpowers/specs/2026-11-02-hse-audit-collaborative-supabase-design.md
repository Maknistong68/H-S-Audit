# HSE Audit — collaborative, Supabase-backed (design)

Date: 2026-11-02
Status: draft for review
Supersedes the storage, accounts and deployment parts of
`2026-10-31-hse-audit-offline-pwa-design.md`. Everything about the checklist,
scoring, walk, ready text, dictation, photos and the Book2 Excel export in that
spec stays as built.

## 1. Purpose

Today each phone holds its own audits and nobody else can see them. The team
wants one shared set of audits: any auditor opens any audit on any device, two
auditors can work on the same audit at the same time and see each other's
answers, notes and photos appear live, and nothing is lost when the site has no
signal.

Supabase becomes the main server. The team signs in; accounts are invite-only
and managed from the app.

Success looks like:

- Two phones on one audit: an answer tapped on one appears on the other within
  a second or two while both are online.
- A phone with no signal keeps working for a whole audit; when signal returns,
  every answer, note and photo reaches the server without anyone doing
  anything, and teammates' changes made meanwhile arrive.
- The Excel export from any phone contains the whole team's work on that audit.
- Only invited people can sign in; viewers cannot edit.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Collaboration | Shared team audits with live updates; no per-audit sharing, no submit/review step |
| Server | The existing Supabase project **Audit Dashboard** (`bqkgfjmestbbvhtslrmc`, ap-southeast-2). The app adds its own `hs_` tables; nothing of the dashboard's is changed |
| Offline | Offline-first: local store plus outbox, synced when online |
| Accounts | Invite-only, email + password, managed from a Team screen by admins; password reset by email |
| Roles | The dashboard's `app_role`: `viewer` (read-only), `auditor`, `lead` (edit), `admin` (edit + team) |
| Conflicts | Per field, last write wins, by the writing device's timestamp |
| Live updates | Supabase Realtime "broadcast from database" on private channels, one per audit plus one for the audit list; presence on the per-audit channel |
| Photos | Private Storage bucket `hs-photos`; thumbnail in the table row; full image downloaded on demand |
| Client | Same Vite + Preact + Dexie app; `@supabase/supabase-js` is the only new runtime dependency |
| Hosting | Vercel project `hse-audit` as today; Supabase migrations and one Edge Function live in this repo |

Out of scope: editing questions or weights, previous-audit comparison, the
dashboard reading live audits (the tables are designed so it can later), audio
memos (already removed from the UI; old local memos are never uploaded),
per-audit permissions, sharing with people outside the team.

## 3. Server side (Supabase)

### 3.1 What already exists and is reused unchanged

- `auth.users`, `public.profiles (id, email, full_name, role app_role)`,
  `public.invites (email, role, invited_by)`.
- `public.app_role()` returns the caller's role, or null when the email is not
  confirmed or the person was never invited. All new policies use it.
- Trigger `handle_new_user` creates the profile from the invite when an auth
  user is created.
- Policies: any member reads their own profile; admins read and update all
  profiles and manage invites.
- `public.contractors (id, doc)` for the optional contractor picker.

### 3.2 New tables

All four tables share the sync columns below. Timestamps written by phones are
epoch milliseconds (`bigint`) so they compare exactly with the per-field map;
`server_at` is the database clock.

| Column | Type | Meaning |
|---|---|---|
| `updated_by` | uuid → auth.users | account that made the newest applied change |
| `updated_at` | bigint | newest per-field timestamp on the row |
| `field_at` | jsonb | `{ "note": 1730000000000, ... }` timestamp of each field's last write |
| `server_at` | timestamptz | set by trigger on every insert/update; drives incremental pull |

```sql
create table public.hs_audits (
  id               uuid primary key,
  audit_no         text not null default '',
  contractor_wo    text not null default '',
  project_name     text not null default '',
  auditors         text not null default '',
  audit_date       date,
  contact_number   text not null default '',
  contractor_id    text references public.contractors(id),
  status           text not null default 'draft' check (status in ('draft','final','archived')),
  template_version text not null,
  last_export_at   bigint,
  deleted_at       bigint,
  created_by       uuid not null default auth.uid() references auth.users(id),
  created_at       bigint not null,
  updated_by uuid references auth.users(id), updated_at bigint not null,
  field_at jsonb not null default '{}'::jsonb, server_at timestamptz not null default now()
);

create table public.hs_answers (
  audit_id  uuid not null references public.hs_audits(id) on delete cascade,
  item_id   text not null,                       -- 'A1', 'B9.1', 'C2.19'
  result    text check (result in ('full','partial','no','na')),
  note      text not null default '',
  flagged   boolean not null default false,
  repeated  boolean not null default false,
  updated_by uuid, updated_at bigint not null, field_at jsonb not null default '{}'::jsonb,
  server_at timestamptz not null default now(),
  primary key (audit_id, item_id)
);

create table public.hs_positives (
  id         uuid primary key,
  audit_id   uuid not null references public.hs_audits(id) on delete cascade,
  text       text not null default '',
  position   integer not null default 0,
  deleted_at bigint,
  created_by uuid not null default auth.uid(), created_at bigint not null,
  updated_by uuid, updated_at bigint not null, field_at jsonb not null default '{}'::jsonb,
  server_at timestamptz not null default now()
);

create table public.hs_photos (
  id           uuid primary key,
  audit_id     uuid not null references public.hs_audits(id) on delete cascade,
  owner_kind   text not null check (owner_kind in ('item','positive')),
  owner_id     text not null,                    -- item id or positive id
  mime         text not null default 'image/jpeg',
  bytes        integer not null,
  width        integer, height integer,
  thumb        text,                             -- base64 JPEG, ~200 px, ≤ 16 KB
  storage_path text not null,                    -- '<audit_id>/<photo_id>.jpg'
  uploaded_at  bigint,                           -- null until the file is in Storage
  deleted_at   bigint,
  created_by   uuid not null default auth.uid(), created_at bigint not null,
  updated_by uuid, updated_at bigint not null, field_at jsonb not null default '{}'::jsonb,
  server_at timestamptz not null default now()
);
```

Indexes: `(audit_id)` on answers, positives, photos; `(server_at)` on all four;
`(deleted_at, updated_at desc)` on `hs_audits` for the list.

Soft deletes everywhere (`deleted_at`). Nothing in the app issues a SQL
`DELETE`; there are no delete policies.

### 3.3 Access rules (RLS)

Row Level Security is enabled on all four tables.

| Table | select | insert / update |
|---|---|---|
| `hs_audits` | `app_role() is not null` | `app_role() in ('auditor','lead','admin')`; insert also requires `created_by = auth.uid()` |
| `hs_answers`, `hs_positives`, `hs_photos` | same | same (insert requires `created_by = auth.uid()` where the column exists) |

Direct inserts/updates stay allowed by policy so the single write path below
runs with the caller's rights (`security invoker`), but the client only ever
writes through `hs_apply`.

### 3.4 The single write path: `hs_apply(changes jsonb) returns jsonb`

One call applies a batch of patches in one transaction, field by field:

```jsonc
[
  { "table": "hs_answers", "key": { "audit_id": "…", "item_id": "B4.1" },
    "fields": { "result": "partial" }, "at": 1730000000000 },
  { "table": "hs_audits", "key": { "id": "…" },
    "fields": { "audit_no": "HSSEW-006", "template_version": "book2-2026-10", "created_at": 1730000000000 },
    "at": 1730000000001 }
]
```

Rules:

- `table` must be one of the four; `fields` keys must be in that table's
  allowed set (everything except `id`/key columns, `created_by`, `server_at`,
  `field_at`, `updated_by`, `updated_at`). Anything else raises an error for
  the whole batch.
- Missing row: insert with the given fields, `field_at` = every field at `at`,
  `updated_at = at`, `updated_by = auth.uid()`. A create must include the
  not-null fields (the client always sends the full row on create).
- Existing row (selected `for update`): for each field, apply it only if
  `at > coalesce((field_at->>field)::bigint, 0)`, and record `at` for it.
  `updated_at = greatest(updated_at, at)`; `updated_by = auth.uid()` when at
  least one field was applied.
- Returns `{ "applied": n, "skipped": m }`. Re-sending the same batch is
  harmless (idempotent), which is what makes retries safe.
- `security invoker`, `set search_path = public`, so RLS applies.

### 3.5 Live updates and presence

A trigger `hs_broadcast` (`after insert or update`, each table) calls
`realtime.broadcast_changes('audit:' || audit_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, old)`.
For `hs_audits` the topic is `audit:<id>` and the same row is also sent to
`team:audits` so the list screen updates.

Channels are private. Policies on `realtime.messages`:

- select (receive broadcasts and presence) for `authenticated` where
  `app_role() is not null` and the topic is `team:audits` or starts with
  `audit:`.
- insert for `authenticated` where `app_role() is not null`,
  `extension = 'presence'` and the topic starts with `audit:` (presence
  tracking only; clients never broadcast themselves).

Presence payload: `{ userId, name, itemId | null, at }`.

`server_at` is set by a `before insert or update` trigger on every table.

A trigger on `hs_audits` also calls the dashboard's existing `log_event()` so
audit creation, status and deletion show up in its `audit_events` trail.

### 3.6 Team directory

`hs_team_directory() returns table (id uuid, email text, full_name text, role app_role)`,
`security definer`, callable when `app_role() is not null`. It lets every
member show "Edited by Name" and presence initials; the `profiles` policies
stay admin-only. Team members can therefore see each other's emails.

### 3.7 Storage

Bucket `hs-photos`: private, `allowed_mime_types = {image/jpeg}`,
`file_size_limit = 10 MB`. Object key `<audit_id>/<photo_id>.jpg`.

Policies on `storage.objects` for `bucket_id = 'hs-photos'`: select for any
role; insert for `auditor`, `lead`, `admin`. No update or delete (photos are
immutable; removal is the row's `deleted_at`).

### 3.8 Invitations: Edge Function `invite-user`

`POST /functions/v1/invite-user` with the caller's session and body
`{ email, role }`:

1. Verify the caller's JWT and read their own profile; refuse unless `admin`.
2. Lower-case the email; upsert `public.invites (email, role, invited_by)`.
3. `auth.admin.inviteUserByEmail(email, { redirectTo: <APP_URL>/welcome })`
   with the secret key. The existing trigger creates the profile with the
   invited role.
4. If Auth answers that the user already exists, respond `{ status: 'exists' }`
   so the Team screen can offer "Send sign-in link" instead (see 5.8).

The redirect origin is the request's `Origin` header when it is in the
function's allow list (`https://hse-audit-nine.vercel.app`,
`http://localhost:5173`, `http://localhost:4173`), else the first entry; the
function needs no secret of its own beyond the Supabase-provided URL and keys.

### 3.9 Manual configuration (cannot be done from this repo)

In the Supabase dashboard, Authentication → URL Configuration → Redirect URLs,
add `https://hse-audit-nine.vercel.app/**` and `http://localhost:5173/**`.
Without this, invite and password-reset links fall back to the project's Site
URL. Email confirmation stays on (the dashboard's `app_role()` requires a
confirmed email; invited users are confirmed by accepting the invite).

## 4. Phone side

### 4.1 Modules

```
src/server/
  supabase.ts        createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY); typed Database
  remote.ts          interface Remote (apply, pull, uploadPhoto, downloadPhoto, directory, listen, presence)
  supabaseRemote.ts  Remote over supabase-js
  fakeRemote.ts      in-memory Remote with the same merge rules, for tests (built only with VITE_FAKE_REMOTE=1)
src/auth/
  session.ts         current session + profile ({ id, email, fullName, role }) as a small store; offline-cached
  AuthGate.tsx       picks sign-in / welcome / no-role / app
src/sync/
  outbox.ts          enqueue(table, key, fields, at) in the same Dexie transaction as the local write
  push.ts            drains the outbox in order through remote.apply; photo entries upload first
  pull.ts            incremental fetch by server_at cursor per table; applies with merge
  merge.ts           per-field LWW: applyIncoming(local, incoming, pendingPatches)
  live.ts            channel per open audit + team:audits; presence
  status.ts          store: offline | syncing(n) | synced | error(message)
  engine.ts          wires online/offline/visibility/auth events to push/pull/live
```

`src/db/repo.ts` keeps its public API. Every write becomes "write to Dexie +
enqueue patch" in one transaction; reads are unchanged, so the screens'
`useLiveQuery` calls keep working.

### 4.2 Local schema (Dexie version 3)

Only additions; nothing is dropped.

- `audits`: `createdBy`, `updatedBy`, `fieldAt`, `serverAt`, `deletedAt`,
  `contractorId`, `localOnly` (true for audits made before sign-in existed,
  until uploaded). Indexes add `deletedAt`.
- `answers`, `positives`: `updatedBy`, `fieldAt`, `serverAt`.
- `media`: `createdBy`, `storagePath`, `uploadedAt`, `fieldAt`, `serverAt`,
  `updatedAt`.
- `mediaBlobs`: unchanged; now also a cache of downloaded full-size photos.
- New `outbox`: `++seq, key` with
  `{ seq, kind: 'patch' | 'photo', table, key, fields, at, attempts, lastError }`.
- New `members`: `id` with `{ id, email, fullName, role }` (the directory).
- `settings` gains `sync:cursor:<table>`, `sync:lastPullAt`, `auth:me`.
- `tagOverrides`, `tags` stay but are unused.

Local ids stay what they are: audit, positive and photo ids are already UUIDs;
the local answer id `<auditId>:<itemId>` maps to the server's composite key.

### 4.3 Sync

**Push.** Runs when online, after any local write (debounced 500 ms), on
reconnect and on foreground. Takes up to 200 outbox entries in `seq` order,
groups consecutive `patch` entries into one `hs_apply` batch; a `photo` entry
uploads the blob (`upsert: false`), then sends its row patch with
`uploaded_at`. On success the entries are deleted. On failure: network errors
back off 2 s → 4 s → … → 60 s and keep the queue; a permission error (viewer,
revoked role) stops pushing, keeps the queue and surfaces in the status; a
validation error on a batch is logged, that batch is skipped and reported (it
means a client bug, not data loss, because the local store still has the
values).

**Pull.** On sign-in, reconnect, foreground, after each channel (re)subscribe,
and every 5 minutes while open. Per table: `select * where server_at > cursor
order by server_at limit 1000`, paged until short. The cursor is the newest
`server_at` seen minus 60 s (transactions commit later than their timestamp;
merges are idempotent so overlap is harmless). The first pull of a device
fetches everything. Pull also refreshes `members` and `auth:me`.

**Live.** While an audit screen is open the engine holds `audit:<id>`; the
Home screen holds `team:audits`. Incoming rows go through the same merge as
pulled rows. After a channel reports `SUBSCRIBED` (including re-joins after a
drop) a pull runs to fill any gap.

**Merge** (`merge.ts`, pure, unit-tested): for an incoming row and the local
row, each field is taken from whichever has the newer `fieldAt`; then every
outbox patch for the same key with `at` newer than the incoming `fieldAt` for
that field is re-applied, so the phone shows what the server will converge
to. Rows with `deletedAt` are kept locally and hidden by queries.

**Clock.** `at` is `Date.now()` on the writing device, but never smaller than
the newest `fieldAt` it has seen for that field plus one, so a phone with a
slow clock cannot have its edits silently discarded.

### 4.4 Photos

Taking a photo: resize as today, write `media` + `mediaBlobs` + a `photo`
outbox entry, and copy to the gallery as today. The thumbnail (≤ 16 KB) rides
in the row, so teammates see it immediately. The strip shows a small "waiting
to upload" badge until `uploadedAt` is set.

Opening a teammate's photo downloads the full file into `mediaBlobs`. Excel
export first downloads every missing full-size photo of the audit
("Downloading 3 photos…"); offline, it lists the missing ones and continues
with their thumbnails. Backup zip does the same.

### 4.5 Session, roles and offline

- supabase-js keeps the session in `localStorage` and refreshes it when
  online. Offline, the stored session plus `auth:me` are enough to open the
  app and work; sync waits for a valid token.
- If a refresh is refused (revoked), the app shows Sign in; the local store and
  outbox are kept; after sign-in the push continues. Changes are sent under
  the account signed in at push time, which the audit then shows as the
  editor, so on a shared phone each person signs in as themselves.
- `viewer`: all editing controls are disabled with a "Read-only account"
  note; the repository refuses writes for viewers so nothing is queued.
- No role (invited but not confirmed, or revoked): a "Not in the team yet"
  screen with the signed-in email and a Sign out button.
- Status pill (Home header and audit top bar): Offline · Syncing (n) ·
  Up to date · Problem (tap for the message). Per-audit "n changes waiting"
  on the list.

### 4.6 Presence

The audit channel tracks `{ userId, name, itemId, at }`; `itemId` is the
expanded question. The top bar shows initials of everyone else in the audit;
the question row they are on shows "Name is here". Best-effort only.

### 4.7 Safety nets kept

Debounced note writes with flush on background; local snapshots and restore
(a restore enqueues patches like any edit); backup zip export; soft delete with
Undo for positives and photos. "Delete audit" becomes "Delete for the team":
typed audit number as today, sets `deleted_at`; admins see a "Deleted" filter
on Home with Restore.

## 5. Screens

### 5.1 Sign in (`/sign-in`)
Email, password, "Sign in", "Forgot password?" (sends a reset email; the link
opens `/reset`). Errors are inline. No sign-up link: accounts come from
invitations.

### 5.2 Welcome (`/welcome`)
Opened from the invite email. Shows the email, asks for full name and a
password (min 8), saves both (`updateUser`, `profiles.full_name`) and goes to
Home.

### 5.3 Reset (`/reset`)
Opened from the reset email: new password, then Home.

### 5.4 Home
Team audits (not deleted), newest `updated_at` first: audit no, project,
progress ring, "Edited by Name · 2 min ago", pending-changes count. Filters
All / Mine (created by me) / Archived (admins also Deleted); search by audit
no or project. "New audit" as today. Sync pill in the header. Card
"N audits on this phone are not in the team yet" with Upload while
`localOnly` audits exist (see 6).

### 5.5 Audit header
Unchanged, plus an optional Contractor picker (dashboard `contractors`,
read-only list cached in Dexie on pull) that fills Contractor/WO.

### 5.6 Walk, Findings, Score, Export
Layouts unchanged. Added: presence initials in the top bar; "Name is here"
row marker; "Edited by Name · time" in the open item card; read-only mode for
viewers; export shows the photo download step.

### 5.7 Settings
New Account section at the top: name (editable), email, role, Sign out. Team
link for admins. Existing dictation and photo-copy options below.

### 5.8 Team (`/team`, admins)
Members: name, email, role (dropdown: viewer / auditor / lead / admin, saved
to `profiles.role`), "Remove access" (sets role to null, keeps the account).
Invite form: email + role → `invite-user`; below it a one-line reminder of the
redirect-URL setting in 3.9. Pending invitations (invites whose email has no
confirmed user) with "Send sign-in link", which calls `resetPasswordForEmail`:
it works for invited-but-not-accepted and for existing users alike, and its
link always opens `/reset`, which also asks for a name when the profile has
none.

## 6. Audits already on phones

The Dexie v3 upgrade marks every existing audit `localOnly: true`; audits
created after that are team audits from the first keystroke (their create
patch is enqueued at once). Home shows the upload card; Upload enqueues full-row `create` patches for the audit, its
answers, positives and photos (ids unchanged, `created_by` = the uploader) and
clears `localOnly`. Backup-zip import does the same with fresh ids. Old audio
memos stay local only.

## 7. Export

Unchanged: the Book2 workbook with live Part 3 formulas and in-cell photos is
built on the phone from the local store, after the photo download step in 4.4.
`markExported` becomes a patch of `last_export_at`, so the team sees when an
audit was last exported.

## 8. Testing

- Unit (Vitest): `merge.ts` (field LWW, pending-over-incoming, deletes,
  clock floor), `outbox.ts` and `push.ts` with a fake remote (ordering,
  batching, photo-before-row, backoff, permission stop), `pull.ts` cursor
  logic, `fakeRemote.ts` itself against the `hs_apply` rules, auth gating by
  role, repo write refusal for viewers.
- End-to-end (Playwright, Pixel 7 project, app built with
  `VITE_FAKE_REMOTE=1`): sign in / wrong password / no-role screen; two
  contexts on one audit seeing each other's answers and notes; offline edits
  (fake remote switched off) that sync on reconnect with the pill going
  Offline → Syncing → Up to date; photo "waiting to upload" badge clearing;
  viewer read-only; admin Team screen invite and role change; upload of
  pre-existing local audits; export after a teammate's photo.
- Live check before reporting: a throw-away invited test account on the real
  project; create an audit on one browser context, answer on another, confirm
  the row through SQL, export, then remove the account and its rows.

## 9. Deployment

- `supabase/migrations/2026110201_hs_tables.sql`, `…02_hs_apply.sql`,
  `…03_hs_realtime.sql`, `…04_hs_storage.sql`, `…05_hs_directory.sql`,
  applied to the Audit Dashboard project; `supabase/functions/invite-user/`
  deployed to it.
- Vercel env (all targets): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_…` key). `.env.example`
  documents them; `npm run dev` reads `.env.local`.
- The PWA precache is unchanged; Supabase calls are cross-origin and never
  cached by the service worker.
- Manual step for the owner: the Auth redirect URLs in 3.9.

## 10. Risks and how they are handled

| Risk | Handling |
|---|---|
| Two people edit the same note at once | Per-field last write wins; the loser's text is replaced, and the card names the last editor. Notes are usually written by the person at that question; the ready-text options reduce long typing |
| Phone clock wrong | Clock floor in 4.3; the server's `server_at` drives pulls, not phone time |
| Big photos on a weak link | Uploads retry with backoff; photos are already resized on capture; thumbnails arrive first |
| Someone's role revoked mid-audit | Push stops with a clear status; local data stays; an admin restoring the role resumes it |
| Redirect URLs not configured | Invite/reset emails open the project's Site URL instead of the app; the Team screen's invite form carries a reminder of the setting |
