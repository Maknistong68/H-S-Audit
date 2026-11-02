# HSE Audit

An installable web app for the team's Health & Safety Inspection Checklist:
every auditor signs in, audits belong to the team, two people can work on the
same audit at once and see each other's answers, notes and photos live, and
the app keeps working on site with no signal and syncs when a connection
returns. Walk the 81 questions in sequence, by area or by search; record
results, notes and photos; export the same Excel workbook the reporting chain
already uses.

Live app: **https://hse-audit-nine.vercel.app** (Vercel, auto-deploys on
every push to the repository's production branch). The server is the
Supabase project shared with the Audit Dashboard; see `supabase/README.md`.

## Accounts and the team

- **Sign in** with email and password. Accounts are by invitation only.
- **Admins** open **Settings → Manage team** to invite teammates (they get an
  email that opens the app to choose a password), change roles, remove
  access and resend sign-in links.
- **Roles** are the dashboard's: *viewer* can open and export audits but not
  change them; *auditor* and *lead* edit; *admin* also manages the team.
- A member's **name** (Settings → Account) is what teammates see next to
  edits ("Edited by …") and in the presence chips of an open audit.

One manual step per Supabase project: add the app's address to the Auth
redirect list (`supabase/README.md` has the clicks). Without it, invite and
reset emails open the project's Site URL instead of the app.

## Offline and sync

Every change is saved on the phone first and queued for the server. The pill
in the header says **Offline**, **Syncing (n)**, **Up to date** or
**Problem** (tap it for the reason). Audits made before accounts existed show
an **Upload** card on the home screen so nothing is left behind.

## Install on the phone

Open the link above once while online, then:

- **iPhone / iPad (Safari):** tap Share → **Add to Home Screen**. Installing
  is what keeps the app's data safe from Safari's storage clean-up.
- **Android (Chrome):** tap the menu (⋮) → **Install app** (or **Add to Home
  screen**).

After that the app opens from the home screen and works with no signal.
The very first open needs a connection so the app (and the Excel template)
can be downloaded; from then on it is fully offline.

## On site, then on the PC

1. **Audits → New audit**, fill the header (the contractor picker fills the
   WO field from the dashboard's list), **Start walk**.
2. Walk the questions in **Sequence** (A1 → C2.19), by **Area** (Documentation,
   Site walk, Clinic, Electrical, …) or by **Search**. Tap a result, add a
   note, photo or voice memo; **Flag** anything to come back to.
3. **Findings** lists every No/Partial with its note and photos, plus the
   positive observations. **Score** shows the section and overall percentages.
4. **Export → Export Excel** builds the Book2-layout workbook on the phone;
   share it to Teams/Email/WhatsApp from the share sheet or download it.
   **Export backup** makes a zip (with the memos) that **Import backup** on
   the home screen can re-open — on the same phone or on the PC.

Nothing is deleted by accident: audits are archived or soft-deleted ("Delete
for the team", which admins can undo), photos can be restored with Undo, and
**Export → Snapshots** keeps restore points (every 15 minutes while you work,
and whenever you leave Walk).

## Deploying

**Vercel (current):** the repository is linked to the Vercel project
`hse-audit`; every push to the production branch builds (`npm run build`, Node
22) and publishes to https://hse-audit-nine.vercel.app. `vercel.json` holds
the SPA rewrite and the service-worker cache header. The base path is `/`
there (Vite reads `VERCEL=1`); set `BASE_PATH` to build for another path.
The build needs two environment variables, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (set on the Vercel project; `.env.example`
lists them for local development in `.env.local`).

**GitHub Pages (alternative):** the app also builds for Pages with two GitHub
Actions workflows, `ci.yml` (typecheck, unit tests, end-to-end tests, build on
every push) and `deploy.yml` (publish `dist/` to Pages on every push to `main`).

The workflow files live in `docs/github-workflows/` because the GitHub App
used by the cloud coding session is not allowed to create files under
`.github/workflows/`. One-time setup, done from the GitHub website or a local
clone:

1. Move `docs/github-workflows/ci.yml` and `docs/github-workflows/deploy.yml`
   to `.github/workflows/` and commit.
2. In the repository go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Merge to `main`. The deploy workflow publishes the app to
   https://maknistong68.github.io/h-s-audit/.

## Changing the checklist

The question list, weights and section layout come from the cleaned Excel
template. When the standard changes:

```bash
node scripts/make-template.mjs path/to/NewChecklist.xlsx public/templates/hs-audit-template.xlsx
node scripts/extract-checklist.mjs public/templates/hs-audit-template.xlsx src/data/checklist.json
```

then update the default tags in `src/data/tags.json` and bump
`TEMPLATE_VERSION` in `scripts/extract-checklist.mjs`. Never commit the
original audit workbook: it carries names, phone numbers and embedded photos.

## Development

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # tsc
npm test           # unit tests (vitest)
npm run e2e        # end-to-end tests (playwright, builds + previews the app)
npm run build      # production build into dist/
```
