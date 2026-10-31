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

## Development

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # tsc
npm test           # unit tests (vitest)
npm run e2e        # end-to-end tests (playwright, builds + previews the app)
npm run build      # production build into dist/
```
