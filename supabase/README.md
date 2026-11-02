# Supabase (the "Audit Dashboard" project)

The app's server is the existing Supabase project `bqkgfjmestbbvhtslrmc`
(`https://bqkgfjmestbbvhtslrmc.supabase.co`), shared with the Audit Dashboard.
Everything the app adds is prefixed `hs_` (plus the `hs-photos` bucket and
policies on `realtime.messages` and `storage.objects`); nothing of the
dashboard's own tables, functions or policies is changed.

## Migrations

`migrations/` holds the SQL in the order it was applied:

| File | What it adds |
|---|---|
| `2026110201_hs_tables.sql` | `hs_audits`, `hs_answers`, `hs_positives`, `hs_photos`, indexes, the `server_at` trigger, row-level security |
| `2026110202_hs_apply.sql` | `hs_apply(changes jsonb)`: the single write path, field-level last-write-wins |
| `2026110203_hs_realtime.sql` | broadcast triggers (`audit:<id>`, `team:audits`) and the `realtime.messages` policies |
| `2026110204_hs_storage.sql` | the private `hs-photos` bucket and its policies |
| `2026110205_hs_directory.sql` | `hs_team_directory()`, `hs_contractors()`, `hs_set_my_name()`, the audit trail trigger |

They were applied with the Supabase MCP `apply_migration` tool. To apply them
elsewhere: `supabase link --project-ref <ref> && supabase db push`.

Channels are all private, so the Realtime setting "Allow public access" does
not need changing.

## One manual step: Auth redirect URLs

Invite and password-reset emails carry a link back to the app. Supabase only
follows a link to an address on its allow list, so once per project:

1. Open the project in the Supabase dashboard.
2. Go to **Authentication → URL Configuration**.
3. Under **Redirect URLs**, add
   - `https://hse-audit-nine.vercel.app/**`
   - `http://localhost:5173/**` (for `npm run dev`)
4. Save.

Leave the Site URL as it is (the dashboard's). Email confirmation stays on:
the dashboard's `app_role()` only grants a role to confirmed emails, and an
invited person is confirmed the moment they accept the invite.

## Edge Function

`functions/invite-user/` is deployed with the Supabase MCP
`deploy_edge_function` tool (or `supabase functions deploy invite-user`). It
needs no secrets beyond the ones Supabase provides to every function.
