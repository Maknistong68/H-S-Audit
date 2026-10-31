# HSE Audit — offline-first PWA for the Health & Safety Inspection Checklist

Date: 2026-10-31
Status: draft for review
Source template: `Book2.xlsx` ("Health & Safety" sheet, audit HSSEW-004)

## 1. Purpose

Auditors run the Health & Safety Inspection Checklist on a construction site
with a phone, then re-type everything on a cloud PC. Sharing files with the
cloud PC is awkward and the Excel checklist is hard to use one-handed on site.

The app lets one auditor draft the whole audit on the phone, offline, in the
order the site dictates rather than the order of the spreadsheet, with voice,
photos and tags, without ever losing what was entered, and then produces the
same Excel workbook the reporting chain already uses.

Users: the HSE audit team (one phone on site, shared). Secondary use: the same
app opened on the cloud PC, in a wider layout, to polish wording before export.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Platform | Installable web app (PWA), no backend, hosted on GitHub Pages from this repo |
| Devices | One phone per audit; no multi-device merge or live sync |
| Voice | Voice memos (audio clips, offline) **and** dictation into notes (when signal exists) |
| Output | `.xlsx` in exactly the Book2 layout, exported from the phone; plus a backup file the app can re-import |
| History | Each audit standalone; no previous-audit comparison |
| Template | Fixed question list, weights and sections as in Book2; tags editable in-app |

Out of scope for v1: cloud accounts/sync, editing questions or weights in-app,
previous-audit comparison, PDF export, Arabic UI (dictation language only).

## 3. The checklist (data)

81 scored items in three sections. Weights and wording are exactly those in
Book2. Row numbers refer to the template sheet and drive the Excel export.

| Section | Subsections | Items | Template rows |
|---|---|---|---|
| A — Management | (none) | A1–A15, all weight 3 | 9–23 |
| B — Process and Procedures (assessed on site) | B1 RAMS (2), B2 Competent Person (4), B3 Emergency Response (3), B4 Work Permits (2), B5 Utility Clearance (3), B6 Subcontractor Management (9), B7 Training (2), B8 Incident Reporting (1), B9 Fire Prevention (3), B10 PPE (2), B11 Medical (3), B12 Occupational Health (2) | 36 | 28–74 (subsection header rows 27, 30, 35, 39, 42, 46, 56, 59, 61, 65, 68, 72) |
| C — Planning and Commitment | C1 Leadership Engagement (12), C2 Planning (18, numbered C2.2–C2.19) | 30 | 79–90, 92–109 |

Results: `Full`, `Partial`, `No`, `N/A`, or unanswered.

### 3.1 Single source of truth

- `public/templates/hs-audit-template.xlsx` — Book2 with all audit data
  cleared (header cells, results, notes, positive observations, and the
  previous-audit block in rows 237–322 removed). Formulas, merges, widths,
  fonts, fills and conditional formatting are kept.
- `scripts/extract-checklist.mjs` reads the template with ExcelJS and writes
  `src/data/checklist.json`: sections → subsections → items with
  `{ id, text, weight, row }`. It is run by hand when the standard changes and
  the JSON is committed, so the app never parses Excel at runtime.
- `src/data/tags.json` — hand-authored default tags per item (below).
- `checklist.json` carries `templateVersion` (e.g. `book2-2026-10`); every
  audit stores the version it was created with.

### 3.2 Default tags

Tag set: `documentation`, `site-walk`, `interview`, `clinic`, `electrical`,
`fire`, `ppe`, `emergency`, `permits`, `excavation`, `subcontractor`,
`training`, `leadership`, `rams`, `incident`, `lifting`, `traffic`.

| Items | Default tags |
|---|---|
| A1, A9, A12, A15 | documentation, leadership |
| A2, A4, A5, A6, A10, A11, A14 | documentation |
| A3 | documentation, training |
| A7 | documentation, incident |
| A8 | documentation, site-walk |
| A13 | documentation, subcontractor |
| B1.1 | rams, site-walk, documentation |
| B1.2 | rams, site-walk |
| B2.1 | site-walk, documentation |
| B2.2 | documentation |
| B2.3 | documentation, site-walk |
| B2.4 | site-walk |
| B3.1, B3.3 | emergency, documentation |
| B3.2 | emergency, site-walk, interview |
| B4.1 | permits, documentation, site-walk |
| B4.2 | permits, site-walk |
| B5.1 | excavation, documentation |
| B5.2 | excavation, permits |
| B5.3 | excavation, site-walk |
| B6.1, B6.2, B6.3, B6.5, B6.6, B6.9 | subcontractor, documentation |
| B6.4 | subcontractor, site-walk |
| B6.7 | electrical, documentation, site-walk |
| B6.8 | electrical, documentation |
| B7.1 | training, documentation |
| B7.2 | training, documentation, interview |
| B8.1 | incident, site-walk, interview |
| B9.1, B9.2, B9.3 | fire, site-walk |
| B10.1 | ppe, site-walk, documentation |
| B10.2 | ppe, site-walk |
| B11.1 | clinic |
| B11.2, B12.1, B12.2 | clinic, documentation |
| B11.3 | clinic, site-walk |
| C1.1, C1.3, C1.4, C1.5, C1.6, C1.7, C1.8 | leadership, documentation |
| C1.2 | leadership, site-walk |
| C1.9, C1.10, C1.11 | rams, site-walk |
| C1.12 | rams, documentation |
| C2.2, C2.3, C2.5, C2.6, C2.12, C2.15, C2.16, C2.17, C2.19 | documentation |
| C2.4 | documentation, training |
| C2.7 | documentation, emergency |
| C2.8 | documentation, clinic |
| C2.9 | documentation, subcontractor |
| C2.10 | documentation, traffic |
| C2.11 | documentation, lifting |
| C2.13 | documentation, fire |
| C2.14 | documentation, electrical |
| C2.18 | documentation, site-walk |

Tags on an item can be changed in-app; the change is stored as an override
for that item and applies to all audits on that phone. New tags can be created
in Settings. Tags are not exported to Excel.

## 4. Screens and flows

Phone-first, bottom navigation: **Walk · Findings · Score · Export**, with
Audits (home) and Settings reachable from the top bar.

### 4.1 Audits (home)
List of audits (audit no, contractor, date, progress ring, status
draft/final/archived). Actions: **New audit**, **Import backup**, show
archived. No audit is ever deleted from this screen (see §6).

### 4.2 Audit header
Contractor / WO, Project name, Auditors, Audit date, Audit no, Contact
number. Saved on every change. Audit no is used in export file names.

### 4.3 Walk — the core screen
One card per item. The same cards are reached three ways, chosen by a
segmented control at the top: **Sequence · Area · Search**. A progress line
shows answered / 81 and the flagged count. A **Remaining only** toggle hides
answered items in every mode.

- **Sequence**: A1 → C2.19 with sticky section and subsection headers; a
  "Jump to" bottom sheet lists sections with per-section progress.
- **Area**: a horizontally scrolling row of tag chips with counts
  ("Documentation 47 · 12 done"); one tag selected at a time; the list shows
  the items carrying that tag, in checklist order.
- **Search**: text input, debounced; matches item id, question text and the
  auditor's note; matches highlighted.

Item card, collapsed: id, one-line question, weight chip, result chip, first
line of the note, photo/audio counts, flag. Tapping expands it (one card
expanded at a time):

- Result: four buttons at least 48 px tall — Full (green), Partial (amber),
  No (red), N/A (grey) — the same colours as the sheet's conditional
  formatting. Tapping the selected result again clears it.
- Note: auto-growing textarea. Choosing No or Partial opens the note and
  focuses it; choosing Full or N/A leaves it collapsed but reachable.
- Toolbar: **Dictate** (mic → text), **Memo** (record audio), **Photo**
  (camera / gallery), **Flag** (come back later), **Repeated** (marks the
  finding as a repeated observation), **Tags** (edit this item's tags).
- Media strip: photo thumbnails and audio clips with play/pause and duration;
  each can be removed (soft delete, restorable from the item until the audit
  is purged).
- Footer: **Previous**, **Next**, **Next unanswered** (primary).

Answering an item in any mode updates the same record, so switching from
Sequence to Area never shows stale state.

### 4.4 Findings (Part 3)
- Negative observations: every item with result No or Partial, in checklist
  order, with id, question, note (editable inline) and photos. Rows with no
  note or no photo show a "missing evidence" marker.
- Positive observations: free list; each has text and optional photos.
- Header shows counts of negative and positive observations.

### 4.5 Score (Part 2)
Bars for A, B (and B1–B12), C (C1, C2); overall percentage and compliance
band; unanswered count with the note "not counted yet". Scoring rules in §7.

### 4.6 Export
- **Export Excel** — builds the `.xlsx` on the phone (§8).
- **Export backup** — builds the backup `.zip` (§9).
- Both offer the phone's share sheet when `navigator.canShare({ files })`
  is available, else a download.
- Pre-export check lists unanswered items, No/Partial items without a note,
  and empty header fields; the auditor can proceed anyway.
- **Snapshots** — list of automatic snapshots with one-tap restore (§6).
- **Mark as final** — sets status; the audit stays editable.

### 4.7 Settings
Dictation language (default `en-US`; `ar-SA` offered), tag manager
(add/rename tags), storage status (persistent or not, usage estimate, a
button to request persistence), app version, "Install to home screen" hint,
and the update-available control (§11).

### 4.8 Desk layout
At widths ≥ 900 px (the cloud PC) the Walk and Findings screens become two
panes: compact list on the left, the expanded card on the right. Keyboard:
`1`–`4` set the result, `J`/`K` move next/previous, `F` flags.

## 5. Data model

Stored in IndexedDB through Dexie, database `hs-audit`, schema version 1.

```ts
type Result = 'full' | 'partial' | 'no' | 'na';

interface Audit {
  id: string;                      // uuid
  templateVersion: string;
  status: 'draft' | 'final' | 'archived';
  header: {
    contractorWo: string; projectName: string; auditors: string;
    auditDate: string /* YYYY-MM-DD */; auditNo: string; contactNumber: string;
  };
  createdAt: number; updatedAt: number;
  lastExportAt?: number;           // xlsx or backup
}

interface Answer {
  id: string;                      // `${auditId}:${itemId}`
  auditId: string; itemId: string;
  result?: Result;
  note: string;
  flagged: boolean;
  repeated: boolean;
  updatedAt: number;
}

interface Positive {
  id: string; auditId: string; text: string; order: number; updatedAt: number;
}

interface Media {
  id: string; auditId: string;
  owner: { kind: 'item'; itemId: string } | { kind: 'positive'; positiveId: string };
  type: 'photo' | 'audio';
  data: ArrayBuffer; mime: string; bytes: number;   // ArrayBuffer, not Blob: structured-clones identically in every browser and in tests
  width?: number; height?: number; durationMs?: number;
  thumb?: ArrayBuffer;             // photos only, ~200 px JPEG
  createdAt: number; deletedAt?: number;
}

interface Snapshot {
  id: string; auditId: string; createdAt: number;
  reason: 'timer' | 'navigation' | 'manual' | 'before-restore' | 'before-import';
  payload: string;                 // JSON of audit + answers + positives + media metadata (no blobs)
}

interface TagOverride { itemId: string; tags: string[] }
interface Tag { id: string; label: string; builtIn: boolean }
interface Setting { key: string; value: unknown }
```

Tables: `audits`, `answers` (index `auditId`), `positives` (index `auditId`),
`media` (indexes `auditId`, `[auditId+type]`), `snapshots` (index
`auditId`), `tagOverrides`, `tags`, `settings`.

Schema v2 (added after review): the `data` bytes of each `Media` row live in
a separate `mediaBlobs` table (`{ id, data }`), so lists, snapshots and
live queries read metadata (with the small thumbnail) only and never load
photos or memos into memory; the v1 → v2 upgrade moves existing bytes
across. Photos are also copied to the phone's Downloads when added (Settings
toggle), and each photo has a Share action.

All reads and writes go through one module (`src/db/repo.ts`); screens never
touch Dexie directly. The repository exposes an observable per audit so
every screen re-renders from the database, never from screen-local copies.

## 6. Data safety (the primary requirement)

1. **Write-through.** Result, flag, repeated, tag and media changes are
   written immediately. Note text is debounced 300 ms; `visibilitychange`,
   `pagehide` and `beforeunload` flush pending writes. No audit state lives
   only in memory.
2. **Persistent storage.** `navigator.storage.persist()` is requested when
   the first audit is created; the result and `navigator.storage.estimate()`
   are shown in Settings. The home screen reminds the auditor to install the
   app (home screen) on iOS, which exempts its storage from eviction.
3. **Snapshots.** A snapshot of the audit (no blobs) is taken every 15
   minutes while it is being edited, on leaving the Walk screen, before any
   restore or import, and on demand. The last 40 per audit are kept; older
   ones are pruned. Restore replaces answers/positives from the snapshot and
   relinks media by id; blobs are never touched by restore.
4. **No hard delete.** Archiving an audit hides it. Purging requires typing
   the audit number and is the only path that removes answers, media and
   snapshots. Removing a photo or clip sets `deletedAt`; it stays restorable
   until purge.
5. **Export nudge.** If an audit has edits newer than its `lastExportAt` by
   more than two hours, a banner on Walk offers "Export backup".
6. **Small media.** Photos are resized to a 1600 px long edge, JPEG quality
   0.8 (about 200–400 KB); audio uses Opus or AAC at the browser's default
   bitrate; clips are capped at 5 minutes.
7. **Schema migrations only add.** Dexie versions never drop a table or
   field; an unknown field is preserved.
8. **Updates never interrupt.** A new app version is announced with a toast
   and applied only when the auditor taps it (§11).

## 7. Scoring (replicates the sheet)

Pure functions in `src/domain/scoring.ts`, no I/O.

- Item points: Full = weight, Partial = weight × 0.5, No = 0.
- Item possible: weight, unless result is N/A.
- Unanswered items are excluded from both points and possible in the app
  and reported as "unanswered". (In Excel an unanswered cell counts as
  possible with 0 points, which is why the pre-export check lists them.)
- Subsection score = points / possible. Section score for B and C is the
  weighted sum over all their items (same as the sheet's `SUM` of
  subsection points over `SUM` of subsection possible), not an average of
  subsection percentages. Section A has no subsections.
- A section or subsection with possible = 0 is "N/A".
- Overall = arithmetic mean of the A, B and C percentages, excluding N/A
  sections (the sheet's `AVERAGE(T120, T121, T134)`).
- Band, on the overall percentage rounded to the nearest whole number:
  90–100 Compliant, 80–89 Mostly Compliant, 70–79 Moderately Compliant,
  60–69 Minimally Compliant, below 60 Non-Compliant.

Golden test: feeding Book2's recorded results into the engine must give
A = 25.5/36, B = 45/69, C = 34/36, overall 0.76832 (the sheet's cached
values).

## 8. Excel export

`src/export/excel.ts` loads the template with ExcelJS, writes values, and
serialises to a `Blob` named `<auditNo>-HS-Audit-<auditDate>.xlsx`.

Cell mapping (`src/export/mapping.ts`):

| Content | Cells |
|---|---|
| Contractor / WO, Project, Auditors | D2, D3, D4 and the repeats at D113–D115 and D147–D149 |
| Audit date (as an Excel date), Audit no, Contact number | Q2, Q3, Q4 and repeats at Q113–Q115, Q147–Q149 |
| Item result | column T of the item's `row`: `Full`, `Partial`, `No`, `N/A`, or empty |
| Item note | column U of the item's `row`; prefixed `Repeated observation. ` when the Repeated toggle is on |
| Part 3 observation rows 155–235 | one row per item in checklist order: B = id, C = question, H = note when result is No/Partial (else empty), R = `COMPLIANT` when Full, `N/A` when N/A. The template's formulas in B, C, H and R of these rows are replaced by these values |
| Part 3 photos | embedded in R:T of the item's Part 3 row (about 240 px wide) in a grid of two per line, each 110 × 82 px; the row height is raised to fit the lines. At most eight photos per item go into the Excel (the rest stay in the backup). No rows are inserted, so no formula references move |
| Negative / positive counts | H152, P152 |
| Positive observations | rows from 239 onward (the rows Book2 uses for them; C:G, H:Q and R:T are merged there): C = `Positive`, H = text, photos in R:T as above |
| Part 2 formulas (R120:T137) and Part 1 section-score formulas | kept from the template; their cached results are set from the scoring engine so previews that do not recalculate still show numbers; `fullCalcOnLoad` is set so Excel recalculates on open |

Acceptance: a workbook exported from Book2's own data, read back with
ExcelJS, has the same values in every mapped cell, the same merged ranges
and column widths as the template, and intact formulas in R120:T137. The
template round-trips through ExcelJS without losing conditional formatting
(verified once during implementation; if ExcelJS drops it, the export
re-applies the result-colour rules programmatically).

## 9. Backup and import

`src/db/backup.ts` builds `<auditNo>-backup.zip` with `fflate` (stored, no
compression — media is already compressed):

```
audit.json      { formatVersion: 1, templateVersion, audit, answers, positives, media: [metadata without blobs] }
photos/<mediaId>.jpg
audio/<mediaId>.<ext>
```

Import on the home screen reads the zip, validates `formatVersion` and
`templateVersion`, creates a **new** audit id (never overwrites an existing
audit; a note says "imported from backup"), and restores media blobs. A
snapshot is taken before import for good measure.

## 10. Voice, photos, dictation

- **Memo**: `MediaRecorder` with the first supported of
  `audio/webm;codecs=opus`, `audio/mp4`, `audio/webm`. Tap to start, tap to
  stop; elapsed time shown; a clip stops itself at 5 minutes. The clip is
  saved as `Media` before the UI returns. Playback uses `<audio>` with an
  object URL. Memos go into the backup zip, not the Excel.
- **Dictate**: `SpeechRecognition` / `webkitSpeechRecognition`,
  `continuous`, `interimResults`, language from Settings. Final results are
  appended to the note (a space is inserted); interim text is shown greyed
  under the textarea and never saved. The button is disabled, with the hint
  "Needs mobile signal", when the API is missing or `navigator.onLine` is
  false; a `network` error stops recognition and shows "No signal for
  dictation — record a memo instead".
- **Photo**: `<input type="file" accept="image/*" capture="environment"
  multiple>`; decoded with `createImageBitmap(file, { imageOrientation:
  'from-image' })` (fallback: `<img>`), drawn to a canvas at ≤ 1600 px long
  edge, JPEG 0.8, plus a 200 px thumbnail.
- Microphone and camera permissions are requested on first use, not at
  launch; a denied permission shows how to re-enable it in the browser.

## 11. Technology, structure, delivery

Stack: Vite, Preact + TypeScript, `preact-iso` routing, Dexie, ExcelJS,
fflate, `vite-plugin-pwa` (Workbox), plain CSS with design tokens
(`src/styles/tokens.css`), Vitest + `fake-indexeddb` for unit tests,
Playwright (pre-installed Chromium) for end-to-end.

```
index.html  package.json  vite.config.ts  tsconfig.json
public/            manifest icons, templates/hs-audit-template.xlsx
scripts/           extract-checklist.mjs
src/
  main.tsx  app.tsx
  data/            checklist.json  tags.json  checklist.ts (types + loader + tag merge)
  domain/          types.ts  scoring.ts  search.ts  bands.ts
  db/              db.ts (Dexie schema)  repo.ts  snapshots.ts  backup.ts
  export/          excel.ts  mapping.ts
  media/           photo.ts  audio.ts  dictation.ts
  ui/
    screens/       Home  AuditHeader  Walk  Findings  Score  Export  Settings
    components/    ItemCard  ResultControl  NoteField  MediaStrip  TagChips
                   ProgressLine  BottomNav  Sheet  Toast  Banner
  styles/          tokens.css  base.css
tests/
  unit/            scoring  search  repo  snapshots  backup  excel-mapping
  e2e/             walk.spec.ts  offline.spec.ts  export.spec.ts
.github/workflows/ ci.yml (test + build on every push), deploy.yml (Pages on main)
docs/superpowers/specs/
```

PWA: `registerType: 'prompt'`; all assets and the template precached; the
manifest declares `display: standalone`, portrait orientation, name
"HSE Audit". Base path `/h-s-audit/`; the app is served at
`https://maknistong68.github.io/h-s-audit/` (HTTPS is required for
microphone, camera and installation).

Field-use UI rules: minimum 48 px targets, high-contrast tokens that read in
sunlight, one-handed reach for result buttons and next/previous, no
hover-only affordances, `prefers-reduced-motion` honoured, works from
375 px wide upwards.

## 12. Testing

- Unit: scoring (golden values from Book2, N/A handling, unanswered
  exclusion, bands at boundaries); search (id/question/note, case-folding);
  repo (write-through, debounce flush, soft delete, purge gated); snapshots
  (ring buffer of 40, restore relinks media); backup (round trip preserves
  every field and blob); Excel mapping (values, merges, widths, formulas).
- End-to-end (Playwright): create an audit, answer items in Sequence, switch
  to Area and Search and see the same state, flag and un-flag, add a note,
  go offline (`context.setOffline(true)`), reload, confirm everything is
  present, export Excel and check the download exists and opens with
  ExcelJS. Microphone and camera are not exercised end-to-end; their modules
  are unit-tested against fakes.
- CI runs unit and e2e tests on every push; deploy only runs after they pass.

## 13. Known constraints

- iOS: storage can be evicted for a site that is not installed to the home
  screen and unused for a week; installation is recommended on first launch.
  `MediaRecorder` produces `audio/mp4` on iOS 14.3+.
- Dictation depends on the browser's speech service (network on Android
  Chrome; on-device or network on iOS); it is a convenience, memos are the
  reliable path.
- Web Share with files needs iOS 15+ / Android Chrome; otherwise the file is
  downloaded to the phone's Files/Downloads.
- Large audits (dozens of photos plus memos) can reach tens of megabytes;
  the backup zip is the right vehicle for those, the Excel carries photos
  only.
