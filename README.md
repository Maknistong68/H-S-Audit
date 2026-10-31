# HSE Audit

An installable, fully offline web app for drafting the Health & Safety
Inspection Checklist on a phone, on site: walk the 81 questions in sequence,
by area (documentation, site walk, clinic, electrical, …) or by search; record
results, notes, photos and voice memos; never lose a draft; and export the
same Excel workbook the reporting chain already uses.

Live app: https://maknistong68.github.io/h-s-audit/

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

1. **Audits → New audit**, fill the header, **Start walk**.
2. Walk the questions in **Sequence** (A1 → C2.19), by **Area** (Documentation,
   Site walk, Clinic, Electrical, …) or by **Search**. Tap a result, add a
   note, photo or voice memo; **Flag** anything to come back to.
3. **Findings** lists every No/Partial with its note and photos, plus the
   positive observations. **Score** shows the section and overall percentages.
4. **Export → Export Excel** builds the Book2-layout workbook on the phone;
   share it to Teams/Email/WhatsApp from the share sheet or download it.
   **Export backup** makes a zip (with the memos) that **Import backup** on
   the home screen can re-open — on the same phone or on the PC.

Nothing is deleted by accident: audits are archived, photos and memos can be
restored with Undo, and **Export → Snapshots** keeps restore points (every
15 minutes while you work, and whenever you leave Walk).

## Deploying

The app is static and deploys to GitHub Pages with two GitHub Actions
workflows, `ci.yml` (typecheck, unit tests, end-to-end tests, build on every
push) and `deploy.yml` (publish `dist/` to Pages on every push to `main`).

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
