# HSE Audit offline PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable, fully offline web app in which one auditor drafts the 81-item Health & Safety Inspection Checklist on a phone (sequence, by area, or by search), with notes, photos, voice memos and dictation, never loses data, and exports the Book2-layout `.xlsx` plus a re-importable backup.

**Architecture:** Static Preact SPA; all state in IndexedDB through one repository module; pure scoring/search/mapping modules with no I/O; Excel built on-device by filling a cleaned copy of Book2 with ExcelJS (lazy-loaded); snapshots and a zip backup guard the data; GitHub Pages hosts it.

**Tech Stack:** Node 22, Vite 8.3.5, Preact 10.29.8, preact-iso 2.12.2, TypeScript 5, Dexie 4.4.0, ExcelJS 4.4.0, fflate 0.8.3, vite-plugin-pwa 2.0.0, Vitest 5.0.5 + fake-indexeddb 6.2.7, @playwright/test 1.63.0 (pinned to the pre-installed browsers).

**Spec:** `docs/superpowers/specs/2026-10-31-hse-audit-offline-pwa-design.md`

## Global Constraints

- Dependency versions exactly as in the Tech Stack line; `@playwright/test` must stay `1.63.0` (matches `/opt/pw-browsers`); CI installs browsers itself.
- Vite `base` is `/h-s-audit/`; every runtime asset path is built from `import.meta.env.BASE_URL`.
- TypeScript `strict: true`, `jsxImportSource: "preact"`; `npm run typecheck` (`tsc --noEmit`) must pass before every commit.
- Screens never import Dexie; they use `src/db/repo.ts`, `src/db/snapshots.ts`, `src/db/backup.ts` only.
- Scoring: Full = weight, Partial = weight × 0.5, No = 0, N/A excluded, unanswered excluded; B and C are weighted sums over items; overall = mean of defined A/B/C ratios; bands on `Math.round(ratio * 100)`: ≥90 Compliant, 80–89 Mostly Compliant, 70–79 Moderately Compliant, 60–69 Minimally Compliant, else Non-Compliant.
- Result colours: full `#1B7F3B`, partial `#B7791F`, no `#C0392B`, na `#6B7280`; tap targets ≥ 48 px; layout works from 375 px; two-pane desk layout at ≥ 900 px; `prefers-reduced-motion` honoured.
- Photos: ≤ 1600 px long edge, JPEG quality 0.8, thumbnail ≤ 200 px. Memos: ≤ 5 minutes. Note debounce 300 ms with flush on `visibilitychange` (hidden), `pagehide`, `beforeunload`.
- Snapshots: every 15 min while editing, on leaving Walk, before restore/import, manual; keep 40 per audit. Export nudge after 2 h of unexported edits.
- No hard delete except `purgeAudit`, which requires the typed audit number.
- Excel: template `public/templates/hs-audit-template.xlsx`; results written as `Full` / `Partial` / `No` / `N/A`; repeated prefix `Repeated observation. `; photos 110 × 82 px, two per line, max eight per item; file name `<auditNo>-HS-Audit-<auditDate>.xlsx`.
- Raw `Book2.xlsx` (contains names and phone numbers) is never committed; only the cleaned template is.
- Commit after every task; commit messages in imperative mood with the attribution footer this session uses.

## Review Focus

1. Note typed and the app backgrounded within 300 ms → the note must still be saved (flush on `visibilitychange`). Pinned in Task 4 (`flush.test.ts`).
2. Same backup imported twice → two separate audits, no key collisions, both with media. Pinned in Task 6.
3. Audit with no answers or only N/A → Score shows "N/A", never `NaN`; Excel export still succeeds with empty T cells and "N/A" cached results. Pinned in Tasks 3 and 7.
4. Audit number containing `/`, `:` or empty → a safe file name is produced for Excel and backup. Pinned in Tasks 6 and 7.
5. Photo the browser cannot decode (e.g. HEIC from the gallery) → clear error "Photo format not supported — use the camera", nothing half-saved. Pinned in Task 8.

---

### Task 1: Project scaffold, test runners, CI

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `README.md`
- Create: `src/main.tsx`, `src/app.tsx`, `src/styles/tokens.css`, `src/styles/base.css`
- Create: `tests/unit/setup.ts`, `tests/unit/smoke.test.ts`, `tests/e2e/smoke.spec.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview` (`vite preview --port 4173 --strictPort`), `typecheck`, `test` (vitest run), `e2e` (playwright test), `postbuild` (copies `dist/index.html` to `dist/404.html`).
- Produces: `src/app.tsx` exporting `App` rendering `<LocationProvider><Router>…</Router></LocationProvider>` with a single `/` route showing `<h1>HSE Audit</h1>` (later tasks add routes).
- Produces: CSS custom properties in `tokens.css`: `--result-full`, `--result-partial`, `--result-no`, `--result-na` (values from Global Constraints), `--tap-min: 48px`, `--bp-desk: 900px`, surface/ink/accent/border colours, `--space-1..6` on a 4 px scale, `--radius`, `--shadow`.

- [ ] **Step 1: Write `package.json`** with the pinned versions, `"type": "module"`, and the scripts above; `.gitignore` with `node_modules`, `dist`, `test-results`, `playwright-report`, `dev-dist`.

- [ ] **Step 2: Write `vite.config.ts`** — `base: '/h-s-audit/'`, plugins `preact()` and `VitePWA({ registerType: 'prompt', includeAssets: ['templates/hs-audit-template.xlsx'], workbox: { globPatterns: ['**/*.{js,css,html,svg,png,xlsx,webmanifest}'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, navigateFallback: '/h-s-audit/index.html' }, manifest: { name: 'HSE Audit', short_name: 'HSE Audit', display: 'standalone', orientation: 'portrait', theme_color: '#0F3D3E', background_color: '#FFFFFF', icons: [] } })` (icons added in Task 15). `build.chunkSizeWarningLimit: 1200`.

- [ ] **Step 3: Write `tsconfig.json`** — `target ES2022`, `module ESNext`, `moduleResolution bundler`, `jsx react-jsx`, `jsxImportSource preact`, `strict`, `skipLibCheck`, `types: ["vite/client"]`, `noEmit`, `include: ["src", "tests", "scripts"]`.

- [ ] **Step 4: Write `vitest.config.ts`** — `test.include: ['tests/unit/**/*.test.ts']`, `environment: 'node'`, `setupFiles: ['tests/unit/setup.ts']` where setup is `import 'fake-indexeddb/auto'`.

- [ ] **Step 5: Write `playwright.config.ts`** — `testDir: 'tests/e2e'`, `use.baseURL: 'http://localhost:4173/h-s-audit/'`, `use.launchOptions.args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']`, one project `mobile` with `devices['Pixel 7']`, `webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173/h-s-audit/', reuseExistingServer: !process.env.CI }`.

- [ ] **Step 6: Write the failing tests**

```ts
// tests/unit/smoke.test.ts
import { test, expect } from 'vitest';
import Dexie from 'dexie';
test('indexeddb is available to tests', async () => {
  const db = new Dexie('smoke'); db.version(1).stores({ t: 'id' });
  await db.table('t').put({ id: 'a' });
  expect(await db.table('t').count()).toBe(1);
});
```
```ts
// tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';
test('app shell loads', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'HSE Audit' })).toBeVisible();
});
```

- [ ] **Step 7: Run `npm install` then `npm test`** — Expected: FAIL (no setup file / config) or PASS once config exists; run `npm run e2e` — Expected: FAIL, no `index.html`.

- [ ] **Step 8: Write `index.html`, `src/main.tsx`, `src/app.tsx`, `tokens.css`, `base.css`** — `index.html` has `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<title>HSE Audit</title>`, `<div id="app">`; `main.tsx` imports both stylesheets and renders `<App />`; `base.css` sets `font-family: system-ui`, `font-size: 16px`, `-webkit-tap-highlight-color: transparent`, `body { margin: 0; background: var(--surface) }`, and `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }`.

- [ ] **Step 9: Write `.github/workflows/ci.yml`** — on `push` and `pull_request`: checkout, `actions/setup-node@v4` with node 22 and npm cache, `npm ci`, `npm run typecheck`, `npm test`, `npx playwright install --with-deps chromium`, `npm run e2e` with `CI=true`, `npm run build`.

- [ ] **Step 10: Run `npm run typecheck && npm test && npm run e2e && npm run build`** — Expected: all PASS; `dist/404.html` exists.

- [ ] **Step 11: Write `README.md`** — one paragraph on purpose, the dev commands, the Pages URL `https://maknistong68.github.io/h-s-audit/`, and "Install to home screen" steps for iOS Safari (Share → Add to Home Screen) and Android Chrome (menu → Install app).

- [ ] **Step 12: Commit** — `git add -A && git commit -m "Scaffold Vite/Preact PWA with unit, e2e and CI"`

---

### Task 2: Template workbook and checklist data

**Files:**
- Create: `scripts/make-template.mjs`, `scripts/extract-checklist.mjs`
- Create: `public/templates/hs-audit-template.xlsx`, `src/data/checklist.json`, `src/data/tags.json`
- Create: `src/domain/types.ts`, `src/data/checklist.ts`
- Test: `tests/unit/checklist.test.ts`, `tests/unit/template.test.ts`

**Interfaces:**
- Produces (`src/domain/types.ts`):
  ```ts
  export type Result = 'full' | 'partial' | 'no' | 'na';
  export type SectionId = 'A' | 'B' | 'C';
  export interface ChecklistItem { id: string; text: string; weight: 1 | 2 | 3; row: number; sectionId: SectionId; subsectionId: string; part3Row: number; }
  export interface Subsection { id: string; title: string; implicit: boolean; items: ChecklistItem[]; }
  export interface Section { id: SectionId; title: string; subsections: Subsection[]; }
  export interface Checklist { templateVersion: string; sections: Section[]; }
  ```
- Produces (`src/data/checklist.ts`): `export const checklist: Checklist` (parsed JSON with `part3Row = 155 + index` and `sectionId`/`subsectionId` filled in), `export function allItems(c: Checklist = checklist): ChecklistItem[]` (checklist order), `export function itemById(id: string, c?: Checklist): ChecklistItem | undefined`, `export function subsectionsOf(c?: Checklist): Subsection[]`, `export const builtInTags: { id: string; label: string }[]`, `export function defaultTagsFor(itemId: string): string[]`.
- Produces: `src/data/tags.json` shaped `{ "tags": [{ "id": "documentation", "label": "Documentation" }, …17 entries], "defaults": { "A1": ["documentation", "leadership"], … } }` — values exactly from spec §3.2.
- Produces: `src/data/checklist.json` shaped `{ "templateVersion": "book2-2026-10", "sections": [{ "id": "A", "title": "MANAGEMENT", "subsections": [{ "id": "A", "title": "MANAGEMENT", "implicit": true, "items": [{ "id": "A1", "text": "…", "weight": 3, "row": 9 }] }] }, …] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/checklist.test.ts
import { test, expect } from 'vitest';
import { checklist, allItems, itemById, subsectionsOf, builtInTags, defaultTagsFor } from '../../src/data/checklist';
test('81 items in three sections', () => {
  expect(allItems().length).toBe(81);
  expect(checklist.sections.map(s => s.id)).toEqual(['A', 'B', 'C']);
  expect(checklist.sections.map(s => s.subsections.flatMap(x => x.items).length)).toEqual([15, 36, 30]);
});
test('rows, weights and part3 rows match Book2', () => {
  expect(itemById('A1')).toMatchObject({ row: 9, weight: 3, sectionId: 'A', subsectionId: 'A', part3Row: 155 });
  expect(itemById('B6.7')).toMatchObject({ row: 53, weight: 2, subsectionId: 'B6' });
  expect(itemById('C2.19')).toMatchObject({ row: 109, weight: 1, part3Row: 235 });
  expect(allItems().reduce((s, i) => s + i.weight, 0)).toBe(153); // A 45 + B 70 + C 38
});
test('subsections', () => {
  expect(subsectionsOf().map(s => s.id)).toEqual(['A','B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11','B12','C1','C2']);
  expect(subsectionsOf()[0].implicit).toBe(true);
});
test('tags', () => {
  expect(builtInTags.map(t => t.id)).toContain('clinic');
  expect(builtInTags.length).toBe(17);
  expect(defaultTagsFor('B11.1')).toEqual(['clinic']);
  expect(defaultTagsFor('B6.7')).toEqual(['electrical', 'documentation', 'site-walk']);
  for (const i of allItems()) expect(defaultTagsFor(i.id).length).toBeGreaterThan(0);
});
```

```ts
// tests/unit/template.test.ts
import { test, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
test('template has formulas but no audit data', async () => {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await readFile('public/templates/hs-audit-template.xlsx'));
  const ws = wb.worksheets[0];
  expect(ws.name).toBe('Health & Safety');
  for (const c of ['D2','Q2','D3','D113','Q147','T9','U9','T109','U109','H152','P152','H155','R155','B242','H242','C239']) expect(ws.getCell(c).value).toBeNull();
  expect((ws.getCell('S120').value as any).formula).toContain('SUMPRODUCT');
  expect((ws.getCell('S24').value as any).formula).toContain('SUMIF');
  expect(ws.model.merges).toContain('H239:Q239'); expect(ws.model.merges.length).toBe(710);
  expect(ws.conditionalFormattings.length).toBe(49);
  expect(ws.getCell('S9').value).toBe(3);
  expect((await stat('public/templates/hs-audit-template.xlsx')).size).toBeLessThan(150_000); // Book2 is 13 MB of embedded photos; the template must not be
});
```
(`import { readFile, stat } from 'node:fs/promises'`.)

- [ ] **Step 2: Run `npm test`** — Expected: FAIL, modules and template missing.

- [ ] **Step 3: Write `scripts/make-template.mjs <book2.xlsx> <out.xlsx>`** in two stages.
  Stage 1 — zip surgery with `fflate` (`unzipSync`/`zipSync`), because Book2 carries ~13 MB of "Place in Cell" evidence pictures stored as rich-value parts that ExcelJS cannot remove: drop every part matching `^(xl\/media\/|xl\/richData\/|xl\/metadata\.xml$|xl\/externalLinks\/|xl\/calcChain\.xml$)`; delete the `<Relationship …/>` elements in `xl/_rels/workbook.xml.rels` whose `Target` starts with `richData/`, `metadata.xml`, `externalLinks/` or `calcChain.xml`; delete the matching `<Override …/>` elements from `[Content_Types].xml`; strip every ` vm="N"` attribute from `xl/worksheets/sheet1.xml`; in `xl/workbook.xml` remove `<externalReferences>…</externalReferences>` and the `#REF!` defined names `EndDate`, `EndWeight`, `StartDate`.
  Stage 2 — ExcelJS on the stripped bytes: null the header cells `D2 Q2 D3 Q3 D4 Q4 D113 Q113 D114 Q114 D115 Q115 D147 Q147 D148 Q148 D149 Q149`; for every row 9–109 whose B matches `/^[ABC]\d+(\.\d+)?$/` and whose S is a number, null T and U; null `H152`, `P152`; for rows 155–235 null B, C, H, R; for rows 236–322 null every cell value; set `height = 30` for rows 155–322; for every formula cell in `R120:T137` and in `S24 S75 S110 S27 S30 S35 S39 S42 S46 S56 S59 S61 S65 S68 S72 S78 S91` set its cached `result` to `undefined`; `workbook.calcProperties.fullCalcOnLoad = true`; write. Expected output ≈ 40 KB.
  Run it with the source at `/root/.claude/uploads/9165cf20-9917-59bd-8f84-efbcb9f3e712/b062a5f1-Book2.xlsx` (copy it to the scratchpad first; never into the repo). Optional local check: `soffice --headless --convert-to csv --outdir <scratch> public/templates/hs-audit-template.xlsx` must succeed.

- [ ] **Step 4: Write `scripts/extract-checklist.mjs <template.xlsx> <out.json>`** — rows 8–109: B in `A|B|C` → section (title = trimmed C); B matching `/^[BC]\d+$/` with a formula in S → subsection; B matching the item regex with numeric S → item `{ id, text: trimmed C, weight, row }`; section A gets one implicit subsection `{ id: 'A', title, implicit: true }`. Write JSON with `templateVersion: 'book2-2026-10'`. Run it to produce `src/data/checklist.json`.

- [ ] **Step 5: Write `src/data/tags.json`** from spec §3.2 and `src/domain/types.ts`, `src/data/checklist.ts` per Interfaces.

- [ ] **Step 6: Run `npm test`** — Expected: PASS.

- [ ] **Step 7: Commit** — `git add scripts src/data src/domain public/templates tests/unit && git commit -m "Add cleaned Book2 template and checklist data"`

---

### Task 3: Scoring and search

**Files:**
- Create: `src/domain/scoring.ts`, `src/domain/search.ts`
- Test: `tests/unit/scoring.test.ts`, `tests/unit/search.test.ts`, `tests/fixtures/book2-results.json`

**Interfaces:**
- Produces (`scoring.ts`):
  ```ts
  export type Band = 'compliant' | 'mostly' | 'moderately' | 'minimally' | 'non';
  export const BAND_LABELS: Record<Band, string>; // 'Compliant', 'Mostly Compliant', 'Moderately Compliant', 'Minimally Compliant', 'Non-Compliant'
  export interface Tally { points: number; possible: number; answered: number; unanswered: number; na: number }
  export interface SubsectionScore { id: string; title: string; tally: Tally; ratio: number | null }
  export interface SectionScore { id: SectionId; title: string; tally: Tally; ratio: number | null; subsections: SubsectionScore[] }
  export interface AuditScore { sections: SectionScore[]; overall: number | null; band: Band | null; unanswered: number; negatives: number }
  export function itemPoints(weight: number, result: Result | undefined): { points: number; possible: number };
  export function scoreAudit(results: ReadonlyMap<string, Result | undefined>, c?: Checklist): AuditScore;
  export function bandFor(ratio: number): Band;
  ```
  `negatives` = count of items with result `no` or `partial`.
- Produces (`search.ts`): `export interface SearchHit { item: ChecklistItem; matchedIn: Array<'id' | 'text' | 'note'> }` and `export function searchItems(query: string, notes: ReadonlyMap<string, string>, items?: ChecklistItem[]): SearchHit[]` — trims, lower-cases, splits on whitespace, every term must match in at least one field (`includes`), empty query → `[]`, order preserved.

- [ ] **Step 1: Write the fixture** `tests/fixtures/book2-results.json` with exactly:

```json
{"A1":"no","A2":"full","A3":"no","A4":"no","A5":"partial","A6":"na","A7":"full","A8":"full","A9":"full","A10":"full","A11":"full","A12":"na","A13":"full","A14":"na","A15":"full","B1.1":"partial","B1.2":"partial","B2.1":"partial","B2.2":"full","B2.3":"full","B2.4":"full","B3.1":"full","B3.2":"partial","B3.3":"full","B4.1":"no","B4.2":"partial","B5.1":"full","B5.2":"full","B5.3":"full","B6.1":"partial","B6.2":"partial","B6.3":"full","B6.4":"full","B6.5":"full","B6.6":"partial","B6.7":"no","B6.8":"no","B6.9":"full","B7.1":"no","B7.2":"partial","B8.1":"partial","B9.1":"full","B9.2":"na","B9.3":"full","B10.1":"partial","B10.2":"no","B11.1":"full","B11.2":"partial","B11.3":"full","B12.1":"full","B12.2":"full","C1.1":"full","C1.2":"full","C1.3":"full","C1.4":"na","C1.5":"na","C1.6":"full","C1.7":"full","C1.8":"full","C1.9":"partial","C1.10":"partial","C1.11":"full","C1.12":"full","C2.2":"full","C2.3":"full","C2.4":"full","C2.5":"full","C2.6":"partial","C2.7":"full","C2.8":"full","C2.9":"full","C2.10":"partial","C2.11":"full","C2.12":"full","C2.13":"full","C2.14":"full","C2.15":"full","C2.16":"full","C2.17":"full","C2.18":"full","C2.19":"full"}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/scoring.test.ts
import { test, expect } from 'vitest';
import fixture from '../fixtures/book2-results.json';
import { scoreAudit, itemPoints, bandFor } from '../../src/domain/scoring';
const book2 = new Map(Object.entries(fixture) as [string, any][]);
test('golden values from Book2', () => {
  const s = scoreAudit(book2);
  const [A, B, C] = s.sections;
  expect([A.tally.points, A.tally.possible]).toEqual([25.5, 36]);
  expect([B.tally.points, B.tally.possible]).toEqual([45, 69]);
  expect([C.tally.points, C.tally.possible]).toEqual([34, 36]);
  expect(s.overall).toBeCloseTo(0.76832, 4);
  expect(s.band).toBe('moderately');
  expect(s.negatives).toBe(25);
  expect(s.unanswered).toBe(0);
  expect(B.subsections.find(x => x.id === 'B6')!.ratio).toBeCloseTo(8 / 15, 6);
});
test('item points', () => {
  expect(itemPoints(3, 'full')).toEqual({ points: 3, possible: 3 });
  expect(itemPoints(3, 'partial')).toEqual({ points: 1.5, possible: 3 });
  expect(itemPoints(2, 'no')).toEqual({ points: 0, possible: 2 });
  expect(itemPoints(2, 'na')).toEqual({ points: 0, possible: 0 });
  expect(itemPoints(2, undefined)).toEqual({ points: 0, possible: 0 });
});
test('empty and all-N/A audits are N/A, never NaN', () => {
  const empty = scoreAudit(new Map());
  expect(empty.overall).toBeNull(); expect(empty.band).toBeNull(); expect(empty.unanswered).toBe(81);
  const allNa = new Map([...book2.keys()].map(k => [k, 'na' as const]));
  const s = scoreAudit(allNa);
  expect(s.sections.every(x => x.ratio === null)).toBe(true); expect(s.overall).toBeNull();
});
test('overall ignores N/A sections', () => {
  const onlyA = new Map([['A1', 'full' as const]]);
  expect(scoreAudit(onlyA).overall).toBe(1);
});
test('bands at boundaries', () => {
  expect(bandFor(0.9)).toBe('compliant'); expect(bandFor(0.895)).toBe('compliant'); expect(bandFor(0.894)).toBe('mostly');
  expect(bandFor(0.8)).toBe('mostly'); expect(bandFor(0.7)).toBe('moderately'); expect(bandFor(0.6)).toBe('minimally'); expect(bandFor(0.599)).toBe('non'); expect(bandFor(0)).toBe('non');
});
```
```ts
// tests/unit/search.test.ts
import { test, expect } from 'vitest';
import { searchItems } from '../../src/domain/search';
const notes = new Map([['B3.2', 'Old NEOC 911 sticker on helmets']]);
test('matches id, text and note, case-insensitively, all terms', () => {
  expect(searchItems('b6', notes).map(h => h.item.id)).toEqual(['B6.1','B6.2','B6.3','B6.4','B6.5','B6.6','B6.7','B6.8','B6.9']);
  expect(searchItems('fire extinguishers', notes).map(h => h.item.id)).toEqual(['B9.1']);
  expect(searchItems('helmets', notes)[0]).toMatchObject({ item: { id: 'B3.2' }, matchedIn: ['note'] });
  expect(searchItems('   ', notes)).toEqual([]);
  expect(searchItems('zzzz', notes)).toEqual([]);
});
```

- [ ] **Step 3: Run `npm test`** — Expected: FAIL, modules missing.

- [ ] **Step 4: Implement `scoring.ts` and `search.ts`** per Interfaces. Section tallies sum their subsections' tallies; `ratio = possible === 0 ? null : points / possible`; `overall` = mean of non-null section ratios or `null`.

- [ ] **Step 5: Run `npm test`** — Expected: PASS.

- [ ] **Step 6: Commit** — `git add src/domain tests && git commit -m "Add scoring engine with Book2 golden test and item search"`

---

### Task 4: Database and repository

**Files:**
- Create: `src/db/db.ts`, `src/db/repo.ts`, `src/db/flush.ts`, `src/db/ids.ts`
- Test: `tests/unit/repo.test.ts`, `tests/unit/flush.test.ts`

**Interfaces:**
- Produces (`db.ts`): record types from spec §5 with `Media.data: ArrayBuffer`, `Media.thumb?: ArrayBuffer`, `Positive.deletedAt?: number`, `Audit.importedAt?: number`; `export class HsAuditDb extends Dexie` with tables `audits, answers, positives, media, snapshots, tagOverrides, tags, settings`; `version(1).stores({ audits: 'id, status, updatedAt', answers: 'id, auditId', positives: 'id, auditId', media: 'id, auditId, [auditId+type]', snapshots: 'id, auditId, createdAt', tagOverrides: 'itemId', tags: 'id', settings: 'key' })`; `export const db = new HsAuditDb()`.
- Produces (`ids.ts`): `export function newId(): string` (`crypto.randomUUID()`), `export function answerId(auditId: string, itemId: string): string` (`${auditId}:${itemId}`), `export function ownerKey(o: MediaOwner): string` (`item:<itemId>` | `positive:<positiveId>`), `export function todayIso(now?: Date): string` (`YYYY-MM-DD` local).
- Produces (`flush.ts`): `schedulePendingWrite(key: string, write: () => Promise<void>, delayMs?: number): void` (default 300; re-scheduling a key replaces its write), `flushPendingWrites(): Promise<void>`, `installFlushListeners(win: Window): void` (flush on `visibilitychange` when hidden, `pagehide`, `beforeunload`).
- Produces (`repo.ts`): `export interface AuditSummary extends Audit { answered: number; flagged: number; total: number }` and
  ```ts
  export const repo = {
    createAudit(header?: Partial<AuditHeader>): Promise<Audit>;     // status 'draft', templateVersion from checklist, auditDate = todayIso()
    getAudit(id: string): Promise<Audit | undefined>;
    listAudits(opts?: { includeArchived?: boolean }): Promise<AuditSummary[]>; // newest updatedAt first
    updateHeader(id: string, patch: Partial<AuditHeader>): Promise<void>;
    setStatus(id: string, status: Audit['status']): Promise<void>;
    markExported(id: string): Promise<void>;
    getAnswers(auditId: string): Promise<Answer[]>;
    setResult(auditId: string, itemId: string, result: Result | undefined): Promise<void>;
    setNote(auditId: string, itemId: string, note: string): Promise<void>;
    setFlag(auditId: string, itemId: string, flagged: boolean): Promise<void>;
    setRepeated(auditId: string, itemId: string, repeated: boolean): Promise<void>;
    listPositives(auditId: string): Promise<Positive[]>;             // not deleted, by order
    addPositive(auditId: string, text: string): Promise<Positive>;
    updatePositive(id: string, text: string): Promise<void>;
    removePositive(id: string): Promise<void>;                        // sets deletedAt
    addMedia(input: Omit<Media, 'id' | 'createdAt' | 'bytes' | 'deletedAt'>): Promise<Media>;
    listMedia(auditId: string, opts?: { owner?: MediaOwner; includeDeleted?: boolean }): Promise<Media[]>;
    softDeleteMedia(id: string): Promise<void>; restoreMedia(id: string): Promise<void>;
    archiveAudit(id: string): Promise<void>;
    purgeAudit(id: string, typedAuditNo: string): Promise<void>;     // throws Error('audit number does not match') otherwise
    getItemTags(itemId: string): Promise<string[]>;                   // override or defaultTagsFor
    setItemTags(itemId: string, tags: string[]): Promise<void>;
    listTags(): Promise<Tag[]>;                                       // builtIn first, then custom, by label
    addTag(label: string): Promise<Tag>;                              // id = slug(label); throws on duplicate id
    renameTag(id: string, label: string): Promise<void>;
    getSetting<T>(key: string, fallback: T): Promise<T>; setSetting(key: string, value: unknown): Promise<void>;
  };
  ```
  Every write that changes audit content also sets `audits.updatedAt = Date.now()` (`touch`). Answer rows are created on first write with `note: ''`, `flagged: false`, `repeated: false`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/flush.test.ts
import { test, expect, vi } from 'vitest';
import { schedulePendingWrite, flushPendingWrites, installFlushListeners } from '../../src/db/flush';
test('debounces per key and flushes on demand', async () => {
  vi.useFakeTimers(); const calls: string[] = [];
  schedulePendingWrite('n:A1', async () => { calls.push('first'); });
  schedulePendingWrite('n:A1', async () => { calls.push('second'); });
  await vi.advanceTimersByTimeAsync(299); expect(calls).toEqual([]);
  await vi.advanceTimersByTimeAsync(1); expect(calls).toEqual(['second']);
  schedulePendingWrite('n:A2', async () => { calls.push('a2'); });
  await flushPendingWrites(); expect(calls).toEqual(['second', 'a2']);
  await vi.advanceTimersByTimeAsync(1000); expect(calls).toEqual(['second', 'a2']);
  vi.useRealTimers();
});
test('visibilitychange to hidden flushes', async () => {
  const listeners: Record<string, () => void> = {};
  const win = { addEventListener: (n: string, f: () => void) => { listeners[n] = f; }, document: { visibilityState: 'hidden' } } as any;
  installFlushListeners(win); const calls: string[] = [];
  schedulePendingWrite('k', async () => { calls.push('x'); });
  listeners['visibilitychange'](); await flushPendingWrites(); expect(calls).toEqual(['x']);
});
```
```ts
// tests/unit/repo.test.ts
import { test, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
beforeEach(async () => { await db.delete(); await db.open(); });
test('create, answer, progress', async () => {
  const a = await repo.createAudit({ auditNo: 'HSSEW-004' });
  expect(a.status).toBe('draft'); expect(a.header.auditDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(a.templateVersion).toBe('book2-2026-10');
  await repo.setResult(a.id, 'A1', 'full'); await repo.setFlag(a.id, 'B1.1', true); await repo.setNote(a.id, 'A1', 'ok');
  const [s] = await repo.listAudits(); expect(s).toMatchObject({ answered: 1, flagged: 1, total: 81 });
  const ans = await repo.getAnswers(a.id); expect(ans.find(x => x.itemId === 'A1')).toMatchObject({ result: 'full', note: 'ok', flagged: false, repeated: false });
  await repo.setResult(a.id, 'A1', undefined); expect((await repo.listAudits())[0].answered).toBe(0);
  expect((await repo.getAudit(a.id))!.updatedAt).toBeGreaterThanOrEqual(a.updatedAt);
});
test('positives and media soft delete', async () => {
  const a = await repo.createAudit();
  const p = await repo.addPositive(a.id, 'Good housekeeping'); await repo.addPositive(a.id, 'Signage');
  await repo.removePositive(p.id); expect((await repo.listPositives(a.id)).map(x => x.text)).toEqual(['Signage']);
  const m = await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'B9.1' }, type: 'photo', data: new Uint8Array([1,2,3]).buffer, mime: 'image/jpeg', width: 4, height: 3 });
  expect(m.bytes).toBe(3);
  await repo.softDeleteMedia(m.id); expect(await repo.listMedia(a.id)).toEqual([]); expect((await repo.listMedia(a.id, { includeDeleted: true })).length).toBe(1);
  await repo.restoreMedia(m.id); expect((await repo.listMedia(a.id, { owner: { kind: 'item', itemId: 'B9.1' } })).length).toBe(1);
});
test('archive hides, purge is gated by typed audit number', async () => {
  const a = await repo.createAudit({ auditNo: 'HSSEW-004' }); await repo.setResult(a.id, 'A1', 'no');
  await repo.archiveAudit(a.id);
  expect(await repo.listAudits()).toEqual([]); expect((await repo.listAudits({ includeArchived: true })).length).toBe(1);
  await expect(repo.purgeAudit(a.id, 'HSSEW-003')).rejects.toThrow(/does not match/);
  expect(await db.answers.count()).toBe(1);
  await repo.purgeAudit(a.id, 'HSSEW-004');
  expect(await db.audits.count()).toBe(0); expect(await db.answers.count()).toBe(0);
});
test('tags: defaults, overrides, custom', async () => {
  expect(await repo.getItemTags('B11.1')).toEqual(['clinic']);
  await repo.setItemTags('B11.1', ['clinic', 'site-walk']); expect(await repo.getItemTags('B11.1')).toEqual(['clinic', 'site-walk']);
  const t = await repo.addTag('Welfare'); expect(t).toMatchObject({ id: 'welfare', label: 'Welfare', builtIn: false });
  await expect(repo.addTag('welfare')).rejects.toThrow();
  await repo.renameTag('welfare', 'Welfare & Camps');
  const all = await repo.listTags(); expect(all.length).toBe(18); expect(all.at(-1)!.label).toBe('Welfare & Camps');
});
test('settings', async () => {
  expect(await repo.getSetting('lang', 'en-US')).toBe('en-US');
  await repo.setSetting('lang', 'ar-SA'); expect(await repo.getSetting('lang', 'en-US')).toBe('ar-SA');
});
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `ids.ts`, `db.ts`, `flush.ts`, `repo.ts`** per Interfaces. `slug(label)` = lower-case, non-alphanumerics → `-`, trimmed of `-`. `listTags` seeds built-in tags from `builtInTags` when the table is empty.

- [ ] **Step 4: Run `npm test`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/db tests/unit && git commit -m "Add IndexedDB schema, repository and debounced write flushing"`

---

### Task 5: Snapshots

**Files:**
- Create: `src/db/snapshots.ts`
- Test: `tests/unit/snapshots.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SNAPSHOT_LIMIT = 40; export const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
  export type SnapshotReason = 'timer' | 'navigation' | 'manual' | 'before-restore' | 'before-import';
  export interface SnapshotPayload { formatVersion: 1; audit: Audit; answers: Answer[]; positives: Positive[]; media: Array<Omit<Media, 'data' | 'thumb'>> }
  export function takeSnapshot(auditId: string, reason: SnapshotReason): Promise<Snapshot>;   // prunes beyond SNAPSHOT_LIMIT, oldest first
  export function listSnapshots(auditId: string): Promise<Snapshot[]>;                        // newest first
  export function restoreSnapshot(snapshotId: string): Promise<void>;                        // takes 'before-restore' first; replaces audit header/status, answers, positives; for media in payload sets deletedAt as in payload
  export function startSnapshotTimer(auditId: string, intervalMs?: number): () => void;      // every interval: snapshot only if audit.updatedAt > newest snapshot.createdAt; returns stop()
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/snapshots.test.ts
import { test, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/db'; import { repo } from '../../src/db/repo';
import { takeSnapshot, listSnapshots, restoreSnapshot, startSnapshotTimer, SNAPSHOT_LIMIT } from '../../src/db/snapshots';
beforeEach(async () => { await db.delete(); await db.open(); });
test('take, list, prune', async () => {
  const a = await repo.createAudit(); await repo.setResult(a.id, 'A1', 'no');
  for (let i = 0; i < SNAPSHOT_LIMIT + 3; i++) await takeSnapshot(a.id, 'manual');
  const list = await listSnapshots(a.id); expect(list.length).toBe(SNAPSHOT_LIMIT);
  expect(list[0].createdAt).toBeGreaterThanOrEqual(list.at(-1)!.createdAt);
  expect(JSON.parse(list[0].payload).answers[0]).toMatchObject({ itemId: 'A1', result: 'no' });
});
test('restore replaces answers and relinks media, after a safety snapshot', async () => {
  const a = await repo.createAudit({ auditNo: 'X' }); await repo.setResult(a.id, 'A1', 'full');
  const m = await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A1' }, type: 'photo', data: new ArrayBuffer(2), mime: 'image/jpeg' });
  const snap = await takeSnapshot(a.id, 'manual');
  await repo.setResult(a.id, 'A1', 'no'); await repo.setResult(a.id, 'A2', 'partial'); await repo.softDeleteMedia(m.id); await repo.updateHeader(a.id, { auditNo: 'Y' });
  await restoreSnapshot(snap.id);
  const ans = await repo.getAnswers(a.id);
  expect(ans.find(x => x.itemId === 'A1')!.result).toBe('full'); expect(ans.find(x => x.itemId === 'A2')).toBeUndefined();
  expect((await repo.listMedia(a.id)).length).toBe(1); expect((await repo.getAudit(a.id))!.header.auditNo).toBe('X');
  expect((await listSnapshots(a.id)).map(s => s.reason)).toEqual(['before-restore', 'manual']);
});
test('timer snapshots only when dirty', async () => {
  vi.useFakeTimers(); const a = await repo.createAudit();
  const stop = startSnapshotTimer(a.id, 1000);
  await vi.advanceTimersByTimeAsync(1000); expect((await listSnapshots(a.id)).length).toBe(0);
  await repo.setResult(a.id, 'A1', 'no'); await vi.advanceTimersByTimeAsync(1000); expect((await listSnapshots(a.id)).length).toBe(1);
  await vi.advanceTimersByTimeAsync(1000); expect((await listSnapshots(a.id)).length).toBe(1);
  stop(); vi.useRealTimers();
});
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL.

- [ ] **Step 3: Implement `snapshots.ts`** per Interfaces inside Dexie transactions (`db.transaction('rw', …)`).

- [ ] **Step 4: Run `npm test`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/db/snapshots.ts tests/unit/snapshots.test.ts && git commit -m "Add audit snapshots with restore and dirty-only timer"`

---

### Task 6: Backup zip and import

**Files:**
- Create: `src/db/backup.ts`, `src/domain/filename.ts`
- Test: `tests/unit/backup.test.ts`, `tests/unit/filename.test.ts`

**Interfaces:**
- Produces (`filename.ts`): `export function safeName(s: string, fallback: string): string` — replaces every char not in `[A-Za-z0-9._-]` with `-`, collapses runs, trims `-`/`.`, returns `fallback` when empty; `export function backupFilename(a: Audit): string` → `${safeName(auditNo,'audit')}-backup.zip`; `export function excelFilename(a: Audit): string` → `${safeName(auditNo,'audit')}-HS-Audit-${safeName(auditDate,'undated')}.xlsx`.
- Produces (`backup.ts`):
  ```ts
  export const BACKUP_FORMAT_VERSION = 1;
  export interface BackupManifest { formatVersion: 1; templateVersion: string; audit: Audit; answers: Answer[]; positives: Positive[]; media: Array<Omit<Media, 'data' | 'thumb'> & { file: string }> }
  export function audioExt(mime: string): 'webm' | 'm4a' | 'ogg' | 'bin';
  export async function buildBackup(auditId: string): Promise<{ bytes: Uint8Array; filename: string }>;  // fflate zipSync level 0: audit.json, photos/<id>.jpg, audio/<id>.<ext>; marks exported
  export async function importBackup(bytes: Uint8Array): Promise<{ auditId: string; warnings: string[] }>;  // new ids for audit/positives/media, importedAt set, 'before-import' snapshot of the new audit; warning when templateVersion differs
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/filename.test.ts
import { test, expect } from 'vitest';
import { safeName, excelFilename, backupFilename } from '../../src/domain/filename';
test('safe names', () => {
  expect(safeName('HSSEW-004', 'audit')).toBe('HSSEW-004');
  expect(safeName('HSSE/W:004 ', 'audit')).toBe('HSSE-W-004');
  expect(safeName('', 'audit')).toBe('audit'); expect(safeName('///', 'audit')).toBe('audit');
  const a: any = { header: { auditNo: 'HSSEW-004', auditDate: '2026-10-28' } };
  expect(excelFilename(a)).toBe('HSSEW-004-HS-Audit-2026-10-28.xlsx'); expect(backupFilename(a)).toBe('HSSEW-004-backup.zip');
  expect(excelFilename({ header: { auditNo: '', auditDate: '' } } as any)).toBe('audit-HS-Audit-undated.xlsx');
});
```
```ts
// tests/unit/backup.test.ts
import { test, expect, beforeEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { db } from '../../src/db/db'; import { repo } from '../../src/db/repo';
import { buildBackup, importBackup, audioExt } from '../../src/db/backup';
beforeEach(async () => { await db.delete(); await db.open(); });
async function seed() {
  const a = await repo.createAudit({ auditNo: 'HSSEW-004', contractorWo: 'WO-1' });
  await repo.setResult(a.id, 'A1', 'no'); await repo.setNote(a.id, 'A1', 'note'); await repo.setRepeated(a.id, 'A1', true);
  await repo.addPositive(a.id, 'Good');
  await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A1' }, type: 'photo', data: new Uint8Array([9,8,7]).buffer, mime: 'image/jpeg', width: 1, height: 1 });
  await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A1' }, type: 'audio', data: new Uint8Array([1]).buffer, mime: 'audio/mp4', durationMs: 1200 });
  return a;
}
test('zip layout', async () => {
  const a = await seed(); const { bytes, filename } = await buildBackup(a.id);
  expect(filename).toBe('HSSEW-004-backup.zip');
  const files = unzipSync(bytes); const names = Object.keys(files).sort();
  expect(names.filter(n => n.startsWith('photos/')).length).toBe(1); expect(names.some(n => /^audio\/.+\.m4a$/.test(n))).toBe(true);
  const m = JSON.parse(strFromU8(files['audit.json']));
  expect(m.formatVersion).toBe(1); expect(m.audit.header.auditNo).toBe('HSSEW-004'); expect(m.answers[0]).toMatchObject({ itemId: 'A1', result: 'no', note: 'note', repeated: true });
  expect(Array.from(files[m.media[0].file])).toEqual([9,8,7]);
  expect((await repo.getAudit(a.id))!.lastExportAt).toBeGreaterThan(0);
});
test('import twice gives two independent audits', async () => {
  const a = await seed(); const { bytes } = await buildBackup(a.id);
  const r1 = await importBackup(bytes); const r2 = await importBackup(bytes);
  expect(r1.auditId).not.toBe(a.id); expect(r2.auditId).not.toBe(r1.auditId);
  expect((await repo.listAudits()).length).toBe(3);
  for (const id of [r1.auditId, r2.auditId]) {
    expect((await repo.getAnswers(id)).find(x => x.itemId === 'A1')).toMatchObject({ result: 'no', note: 'note', repeated: true });
    expect((await repo.listPositives(id)).map(p => p.text)).toEqual(['Good']);
    const media = await repo.listMedia(id); expect(media.length).toBe(2);
    expect(Array.from(new Uint8Array(media.find(m => m.type === 'photo')!.data))).toEqual([9,8,7]);
    expect((await repo.getAudit(id))!.importedAt).toBeGreaterThan(0);
  }
  expect(r1.warnings).toEqual([]);
});
test('audio extensions', () => {
  expect(audioExt('audio/webm;codecs=opus')).toBe('webm'); expect(audioExt('audio/mp4')).toBe('m4a'); expect(audioExt('audio/ogg')).toBe('ogg'); expect(audioExt('x')).toBe('bin');
});
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL.

- [ ] **Step 3: Implement `filename.ts` and `backup.ts`** per Interfaces (`import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'`).

- [ ] **Step 4: Run `npm test`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/db/backup.ts src/domain/filename.ts tests/unit && git commit -m "Add zip backup export and import with fresh ids"`

---

### Task 7: Excel export

**Files:**
- Create: `src/export/mapping.ts`, `src/export/excel.ts`
- Test: `tests/unit/excel.test.ts`, `tests/fixtures/pixel.jpg` (any valid JPEG ≤ 2 KB, generated with Node `sharp`-free approach: copy a tiny JPEG produced by Playwright's `page.screenshot({ type: 'jpeg' })` in a one-off script, or commit a 1×1 JPEG byte literal)

**Interfaces:**
- Produces (`mapping.ts`):
  ```ts
  export const HEADER_CELLS: Record<keyof AuditHeader, string[]> = { contractorWo: ['D2','D113','D147'], projectName: ['D3','D114','D148'], auditors: ['D4','D115','D149'], auditDate: ['Q2','Q113','Q147'], auditNo: ['Q3','Q114','Q148'], contactNumber: ['Q4','Q115','Q149'] };
  export const RESULT_COL = 'T', NOTE_COL = 'U';
  export const RESULT_LABEL: Record<Result, string> = { full: 'Full', partial: 'Partial', no: 'No', na: 'N/A' };
  export const REPEATED_PREFIX = 'Repeated observation. ';
  export const PART3 = { idCol: 'B', questionCol: 'C', noteCol: 'H', evidenceCol: 'R', evidenceColIndex0: 17, positiveFirstRow: 239, positiveLabel: 'Positive', compliant: 'COMPLIANT', na: 'N/A' };
  export const COUNT_CELLS = { negative: 'H152', positive: 'P152' };
  export const PART1_SCORE_CELL: Record<string, string> = { A: 'S24', B: 'S75', C: 'S110', B1: 'S27', B2: 'S30', B3: 'S35', B4: 'S39', B5: 'S42', B6: 'S46', B7: 'S56', B8: 'S59', B9: 'S61', B10: 'S65', B11: 'S68', B12: 'S72', C1: 'S78', C2: 'S91' };
  export const PART2_ROW: Record<string, number> = { A: 120, B: 121, B1: 122, B2: 123, B3: 124, B4: 125, B5: 126, B6: 127, B7: 128, B8: 129, B9: 130, B10: 131, B11: 132, B12: 133, C: 134, C1: 135, C2: 136 };
  export const OVERALL_CELL = 'R137';
  export const PHOTO = { widthPx: 110, heightPx: 82, perLine: 2, maxPerItem: 8, gapPx: 6 };
  export const EVIDENCE_COL_WIDTHS_CHARS = [8, 9.140625, 17.28515625]; // R, S, T
  export function rowHeightPoints(note: string, photoCount: number): number; // max(30, noteLines*12+6, photoLines*(heightPx+gapPx)*0.75+6) capped at 409; noteLines = sum over paragraphs of max(1, ceil(len/70)); photoLines = ceil(min(photoCount, maxPerItem)/perLine)
  export function photoAnchor(index: number, rowHeightPt: number): { colOffset: number; rowOffset: number }; // fractional offsets added to the evidence cell's 0-based col/row for ExcelJS `tl`; see Step 3
  ```
- Produces (`excel.ts`):
  ```ts
  export interface ExportInput { audit: Audit; answers: Map<string, Answer>; positives: Positive[]; photos: Map<string, Uint8Array[]> /* ownerKey → jpeg bytes, in order */; score: AuditScore; checklist?: Checklist }
  export async function buildWorkbook(template: ArrayBuffer | Uint8Array, input: ExportInput): Promise<ExcelJS.Workbook>;
  export async function loadTemplate(): Promise<ArrayBuffer>;        // fetch(`${import.meta.env.BASE_URL}templates/hs-audit-template.xlsx`)
  export async function exportExcel(auditId: string): Promise<{ bytes: Uint8Array; filename: string }>; // repo → ExportInput → buildWorkbook → writeBuffer; marks exported
  ```
  `buildWorkbook` writes: header cells (date as `new Date(auditDate + 'T00:00:00Z')`, empty string when blank); for each item `T` = `RESULT_LABEL[result]` or `null`, `U` = note with `REPEATED_PREFIX` when repeated (null when empty); Part 3 row: B id, C text, H note when result no/partial else null, R `COMPLIANT`/`N/A`/null; photos (first `maxPerItem`) via `wb.addImage({ buffer, extension: 'jpeg' })` + `ws.addImage(id, { tl, ext: { width, height } })`; row height from `rowHeightPoints`; counts; positives from row 239 (C label, H text, photos, height); cached results on `PART1_SCORE_CELL`, `PART2_ROW` (R possible, S points, T ratio or `'N/A'`), `OVERALL_CELL` (overall or `'N/A'`) by replacing only `.result` of the existing formula value; `calcProperties.fullCalcOnLoad = true`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/excel.test.ts
import { test, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import fixture from '../fixtures/book2-results.json';
import { buildWorkbook } from '../../src/export/excel';
import { rowHeightPoints, photoAnchor } from '../../src/export/mapping';
import { scoreAudit } from '../../src/domain/scoring';
const tpl = () => readFile('public/templates/hs-audit-template.xlsx');
const jpg = () => readFile('tests/fixtures/pixel.jpg');
function input(results: Record<string, any>, extra: Partial<any> = {}) {
  const audit: any = { id: 'a', header: { contractorWo: 'WO', projectName: 'Proj', auditors: 'J, G', auditDate: '2026-10-28', auditNo: 'HSSEW-004', contactNumber: '055' }, status: 'draft', templateVersion: 'book2-2026-10', createdAt: 0, updatedAt: 0 };
  const answers = new Map(Object.entries(results).map(([k, r]) => [k, { id: `a:${k}`, auditId: 'a', itemId: k, result: r, note: r === 'no' || r === 'partial' ? `Note for ${k}` : '', flagged: false, repeated: k === 'A1', updatedAt: 0 }]));
  return { audit, answers, positives: [], photos: new Map(), score: scoreAudit(new Map(Object.entries(results) as any)), ...extra };
}
test('fills header, results, notes, part 3 and cached scores', async () => {
  const wb = await buildWorkbook(await tpl(), input(fixture)); const ws = wb.worksheets[0];
  expect(ws.getCell('D2').value).toBe('WO'); expect(ws.getCell('D147').value).toBe('WO'); expect((ws.getCell('Q2').value as Date).toISOString()).toBe('2026-10-28T00:00:00.000Z');
  expect(ws.getCell('T9').value).toBe('No'); expect(ws.getCell('U9').value).toBe('Repeated observation. Note for A1');
  expect(ws.getCell('T14').value).toBe('N/A'); expect(ws.getCell('T10').value).toBe('Full'); expect(ws.getCell('U10').value).toBeNull();
  expect(ws.getCell('B155').value).toBe('A1'); expect(ws.getCell('H155').value).toBe('Repeated observation. Note for A1'); expect(ws.getCell('R155').value).toBeNull();
  expect(ws.getCell('R156').value).toBe('COMPLIANT'); expect(ws.getCell('R160').value).toBe('N/A'); expect(ws.getCell('H156').value).toBeNull();
  expect(ws.getCell('H152').value).toBe(25); expect(ws.getCell('P152').value).toBe(0);
  expect((ws.getCell('S120').value as any).result).toBe(25.5); expect((ws.getCell('R121').value as any).result).toBe(69);
  expect((ws.getCell('T134').value as any).result).toBeCloseTo(34 / 36, 6); expect((ws.getCell('R137').value as any).result).toBeCloseTo(0.76832, 4);
  expect((ws.getCell('S120').value as any).formula).toContain('SUMPRODUCT'); expect(ws.model.merges.length).toBe(710);
  expect(wb.calcProperties.fullCalcOnLoad).toBe(true);
});
test('photos and positives', async () => {
  const photos = new Map([['item:A1', [await jpg(), await jpg(), await jpg()]], ['positive:p1', [await jpg()]]]);
  const positives = [{ id: 'p1', auditId: 'a', text: 'Clean site', order: 0, updatedAt: 0 }];
  const wb = await buildWorkbook(await tpl(), input(fixture, { photos, positives })); const ws = wb.worksheets[0];
  expect(ws.getImages().length).toBe(4);
  expect(ws.getRow(155).height).toBeGreaterThan(ws.getRow(156).height!);
  expect(ws.getCell('C239').value).toBe('Positive'); expect(ws.getCell('H239').value).toBe('Clean site'); expect(ws.getCell('P152').value).toBe(1);
  const out = await wb.xlsx.writeBuffer(); const back = new ExcelJS.Workbook(); await back.xlsx.load(out as any);
  expect(back.worksheets[0].getImages().length).toBe(4);
});
test('empty audit exports with N/A cached scores', async () => {
  const wb = await buildWorkbook(await tpl(), input({})); const ws = wb.worksheets[0];
  expect(ws.getCell('T9').value).toBeNull(); expect((ws.getCell('T120').value as any).result).toBe('N/A'); expect((ws.getCell('R137').value as any).result).toBe('N/A');
});
test('row height and photo anchors', () => {
  expect(rowHeightPoints('', 0)).toBe(30);
  expect(rowHeightPoints('x'.repeat(300), 0)).toBeGreaterThanOrEqual(5 * 12 + 6);
  expect(rowHeightPoints('', 3)).toBeGreaterThanOrEqual(2 * 88 * 0.75 + 6);
  expect(rowHeightPoints('x'.repeat(10000), 0)).toBe(409);
  expect(photoAnchor(0, 100)).toEqual({ colOffset: 0, rowOffset: 0 });
  expect(photoAnchor(1, 100).colOffset).toBeGreaterThan(1); expect(photoAnchor(1, 100).rowOffset).toBe(0);
  expect(photoAnchor(2, 100).colOffset).toBe(0); expect(photoAnchor(2, 100).rowOffset).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Create `tests/fixtures/pixel.jpg`** (a valid JPEG; e.g. write the bytes of a 1×1 JPEG with a one-off Node/Playwright screenshot) and run `npm test` — Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `mapping.ts` and `excel.ts`** per Interfaces. `photoAnchor`: `line = floor(index / perLine)`, `slot = index % perLine`; `colOffset` = px → column fraction walking `EVIDENCE_COL_WIDTHS_CHARS` with px per column = `chars * 7 + 5`; `rowOffset = line * ((heightPx + gapPx) * 0.75) / rowHeightPt`.

- [ ] **Step 4: Run `npm test`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/export tests && git commit -m "Build Book2-layout Excel export from the cleaned template"`

---

### Task 8: Photo, audio memo and dictation modules

**Files:**
- Create: `src/media/photo.ts`, `src/media/audio.ts`, `src/media/dictation.ts`
- Test: `tests/unit/media.test.ts`

**Interfaces:**
- Produces (`photo.ts`): `export const PHOTO_MAX_EDGE = 1600, PHOTO_QUALITY = 0.8, THUMB_MAX_EDGE = 200;` `export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number }` (never upscales, keeps ratio, rounds); `export class UnsupportedPhotoError extends Error` (message `Photo format not supported — use the camera`); `export async function processPhoto(file: Blob, deps?: { decode?: (f: Blob) => Promise<ImageBitmap> }): Promise<{ data: ArrayBuffer; width: number; height: number; thumb: ArrayBuffer; mime: 'image/jpeg' }>` — decode via `createImageBitmap(file, { imageOrientation: 'from-image' })`, on failure throw `UnsupportedPhotoError`; draw to canvas at `fitWithin`; `canvas.toBlob('image/jpeg', 0.8)`.
- Produces (`audio.ts`): `export const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']; export const MEMO_MAX_MS = 300_000;` `export function pickAudioMime(isTypeSupported: (m: string) => boolean): string | null;` `export interface MemoResult { data: ArrayBuffer; mime: string; durationMs: number }` `export function createMemoRecorder(cb: { onTick(ms: number): void; onDone(r: MemoResult): void; onError(e: Error): void }, deps?: { getStream?: () => Promise<MediaStream>; Recorder?: typeof MediaRecorder; now?: () => number; setInterval?: typeof setInterval; clearInterval?: typeof clearInterval }): { start(): Promise<void>; stop(): void; recording(): boolean }` — stops itself at `MEMO_MAX_MS`, releases stream tracks, collects `dataavailable` chunks into one `Blob` → `ArrayBuffer`.
- Produces (`dictation.ts`): `export function dictationAvailable(win: any, online: boolean): boolean;` `export function appendDictated(note: string, text: string): string` (trims `text`; if `note` is empty returns `text`; else joins with a single space, or a newline if `note` ends with `\n`); `export function createDictation(cb: { onFinal(text: string): void; onInterim(text: string): void; onError(code: string): void; onEnd(): void }, opts: { lang: string; win?: any }): { start(): void; stop(): void }` — `continuous = true`, `interimResults = true`, `lang` set; `onresult` splits final vs interim; `onerror` passes `event.error` (`'network'`, `'not-allowed'`, …).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/media.test.ts
import { test, expect, vi } from 'vitest';
import { fitWithin, processPhoto, UnsupportedPhotoError } from '../../src/media/photo';
import { pickAudioMime, createMemoRecorder, MEMO_MAX_MS } from '../../src/media/audio';
import { dictationAvailable, appendDictated, createDictation } from '../../src/media/dictation';
test('fitWithin', () => {
  expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
});
test('undecodable photo throws UnsupportedPhotoError', async () => {
  await expect(processPhoto(new Blob([1]), { decode: async () => { throw new Error('x'); } })).rejects.toBeInstanceOf(UnsupportedPhotoError);
});
test('pickAudioMime prefers opus then mp4', () => {
  expect(pickAudioMime(m => m === 'audio/mp4')).toBe('audio/mp4');
  expect(pickAudioMime(() => true)).toBe('audio/webm;codecs=opus');
  expect(pickAudioMime(() => false)).toBeNull();
});
test('memo recorder collects chunks, ticks, and auto-stops at the cap', async () => {
  vi.useFakeTimers(); let t = 0; const now = () => t;
  class FakeRecorder { static isTypeSupported() { return true; } ondataavailable: any; onstop: any; state = 'inactive'; constructor(public stream: any, public opts: any) {} start() { this.state = 'recording'; } stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob([new Uint8Array([1, 2])]) }); this.onstop(); } }
  const track = { stop: vi.fn() }; const stream: any = { getTracks: () => [track] };
  const ticks: number[] = []; const done = vi.fn(); const err = vi.fn();
  const rec = createMemoRecorder({ onTick: ms => ticks.push(ms), onDone: done, onError: err }, { getStream: async () => stream, Recorder: FakeRecorder as any, now, setInterval, clearInterval });
  await rec.start(); expect(rec.recording()).toBe(true);
  t = 1000; await vi.advanceTimersByTimeAsync(1000); expect(ticks.at(-1)).toBe(1000);
  t = MEMO_MAX_MS; await vi.advanceTimersByTimeAsync(1000);
  expect(rec.recording()).toBe(false); expect(done).toHaveBeenCalledOnce();
  expect(done.mock.calls[0][0]).toMatchObject({ mime: 'audio/webm;codecs=opus', durationMs: MEMO_MAX_MS }); expect(new Uint8Array(done.mock.calls[0][0].data)).toEqual(new Uint8Array([1, 2]));
  expect(track.stop).toHaveBeenCalled(); vi.useRealTimers();
});
test('dictation availability and text joining', () => {
  expect(dictationAvailable({ webkitSpeechRecognition: class {} }, true)).toBe(true);
  expect(dictationAvailable({ webkitSpeechRecognition: class {} }, false)).toBe(false);
  expect(dictationAvailable({}, true)).toBe(false);
  expect(appendDictated('', ' hello ')).toBe('hello'); expect(appendDictated('a', 'b')).toBe('a b'); expect(appendDictated('a\n', 'b')).toBe('a\nb');
});
test('dictation splits final and interim, forwards errors', () => {
  let inst: any; class Fake { lang = ''; continuous = false; interimResults = false; onresult: any; onerror: any; onend: any; constructor() { inst = this; } start() {} stop() { this.onend(); } }
  const final = vi.fn(), interim = vi.fn(), error = vi.fn(), end = vi.fn();
  const d = createDictation({ onFinal: final, onInterim: interim, onError: error, onEnd: end }, { lang: 'ar-SA', win: { webkitSpeechRecognition: Fake } });
  d.start(); expect(inst).toMatchObject({ lang: 'ar-SA', continuous: true, interimResults: true });
  inst.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'no permit ' }], { isFinal: true }), Object.assign([{ transcript: 'at the' }], { isFinal: false })] });
  expect(final).toHaveBeenCalledWith('no permit '); expect(interim).toHaveBeenCalledWith('at the');
  inst.onerror({ error: 'network' }); expect(error).toHaveBeenCalledWith('network');
  d.stop(); expect(end).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL.

- [ ] **Step 3: Implement the three modules** per Interfaces.

- [ ] **Step 4: Run `npm test`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/media tests/unit/media.test.ts && git commit -m "Add photo processing, memo recorder and dictation adapters"`

---

### Task 9: App shell, Home and Audit header screens

**Files:**
- Create: `src/ui/hooks/useLiveQuery.ts`, `src/ui/hooks/useAudit.ts`, `src/ui/components/{BottomNav,TopBar,Toast,Sheet,Banner,ProgressRing}.tsx`, `src/ui/components/toast.ts`, `src/ui/screens/{Home,AuditHeader}.tsx`, `src/ui/download.ts`
- Modify: `src/app.tsx`, `src/main.tsx`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**
- Routes (preact-iso): `/` Home; `/audit/:id/header`; `/audit/:id/walk`; `/audit/:id/findings`; `/audit/:id/score`; `/audit/:id/export`; `/settings` (walk/findings/score/export/settings are placeholders until their tasks).
- Produces: `useLiveQuery<T>(querier: () => Promise<T>, deps: unknown[]): T | undefined` built on Dexie `liveQuery`; `useAudit(id: string)` → `{ audit, answers: Map<string, Answer>, summary }` live.
- Produces: `toast(message: string, opts?: { action?: { label: string; onClick(): void }; durationMs?: number })` + `<Toast />` host; `<Sheet open title onClose>` bottom sheet with focus trap and Escape; `<Banner tone="warn" action>`; `<BottomNav auditId />` with Walk / Findings / Score / Export; `<TopBar title back? right?>`.
- Produces (`download.ts`): `saveOrShare(bytes: Uint8Array, filename: string, mime: string): Promise<'shared' | 'downloaded'>` — Web Share with files when `navigator.canShare?.({ files })`, else anchor download.
- `main.tsx` calls `installFlushListeners(window)` and `navigator.storage?.persist?.()` once an audit exists (Home's New audit handler).
- Home list rows: audit no (or "Untitled audit"), contractor, date, `<ProgressRing answered total>`, status chip; actions **New audit** (creates and routes to `/audit/:id/header`), **Import backup** (file input `.zip` → `importBackup` → toast → route to walk), **Show archived** toggle; archived rows offer **Restore to drafts** and **Purge…** (Sheet asking to type the audit number).
- AuditHeader: six labelled inputs (date input type `date`), saved through `repo.updateHeader` on `input` events via `schedulePendingWrite`; **Start walk** button → `/audit/:id/walk`.

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/home.spec.ts
import { test, expect } from '@playwright/test';
test('create audit, fill header, survives reload, archive and purge gate', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await expect(page).toHaveURL(/\/audit\/[^/]+\/header$/);
  await page.getByLabel('Audit no').fill('HSSEW-004');
  await page.getByLabel('Contractor / WO').fill('4800000882-AL FAHD');
  await page.reload();
  await expect(page.getByLabel('Audit no')).toHaveValue('HSSEW-004');
  await page.goto('./');
  await expect(page.getByText('HSSEW-004')).toBeVisible();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('HSSEW-004')).toBeHidden();
  await page.getByRole('button', { name: 'Show archived' }).click();
  await page.getByRole('button', { name: 'Purge' }).click();
  await page.getByLabel('Type the audit number to confirm').fill('WRONG');
  await expect(page.getByRole('button', { name: 'Purge permanently' })).toBeDisabled();
});
```

- [ ] **Step 2: Run `npm run e2e`** — Expected: FAIL.

- [ ] **Step 3: Implement the hooks, components, screens, routes** per Interfaces, with `tokens.css`-based styles (48 px targets, 16 px gutters). Archive is a row action on Home (button labelled `Archive`), purge via Sheet with the confirmation input labelled `Type the audit number to confirm` and a `Purge permanently` button enabled only on exact match.

- [ ] **Step 4: Run `npm run typecheck && npm test && npm run e2e`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src tests/e2e && git commit -m "Add app shell, audit list and header screens"`

---

### Task 10: Walk screen — sequence, area, search, flags, tags, persistence

**Files:**
- Create: `src/ui/screens/Walk.tsx`, `src/ui/walk/{walkState.ts,useWalkItems.ts}`, `src/ui/components/{ItemCard,ResultControl,NoteField,TagChips,TagEditor,JumpSheet,ProgressLine,ModeSwitch}.tsx`
- Test: `tests/unit/walkState.test.ts`, `tests/e2e/walk.spec.ts`

**Interfaces:**
- Produces (`walkState.ts`, pure):
  ```ts
  export type WalkMode = 'sequence' | 'area' | 'search';
  export interface WalkState { mode: WalkMode; tag: string | null; query: string; remainingOnly: boolean; expandedId: string | null }
  export const DEFAULT_WALK_STATE: WalkState;
  export interface WalkRow { kind: 'section' | 'subsection' | 'item'; id: string; title?: string; item?: ChecklistItem }
  export function visibleRows(state: WalkState, answers: ReadonlyMap<string, Answer>, tagsByItem: ReadonlyMap<string, string[]>, c?: Checklist): WalkRow[];
  // sequence: section + subsection headers (non-implicit) + items; area: items whose tags include state.tag (no headers); search: searchItems() hits; remainingOnly drops items with a result; headers with no visible items are dropped
  export function nextUnanswered(fromId: string | null, rows: WalkRow[], answers: ReadonlyMap<string, Answer>): string | null; // first item after fromId (wrapping) without a result
  export function tagCounts(tagsByItem: ReadonlyMap<string, string[]>, answers: ReadonlyMap<string, Answer>): Map<string, { total: number; done: number }>;
  ```
- Walk state is persisted per audit in settings key `walk:<auditId>` and restored on mount; mode switches scroll the expanded card into view.
- `ResultControl` props `{ value?: Result; onChange(r: Result | undefined): void }` — four buttons with `aria-pressed`, labels `Full`, `Partial`, `No`, `N/A`; tapping the pressed one clears.
- `NoteField` props `{ value: string; onChange(v: string): void; id: string }` — local state, `schedulePendingWrite('note:' + id, …)`, flush on unmount; label "Observation note".
- `ItemCard` props `{ item; answer?; tags; expanded; onToggle(); onResult; onNote; onFlag; onRepeated; onTags; onNext(); onPrev(); onNextUnanswered(); media slot (Task 11) }`; result buttons visible when expanded; choosing `no`/`partial` focuses the note.
- On mount `startSnapshotTimer(auditId)`; on unmount `takeSnapshot(auditId, 'navigation')` then stop the timer.
- Export nudge: `<Banner>` "Edits not backed up for 2 h — Export backup" when `updatedAt - (lastExportAt ?? createdAt) > 2h` and `answered > 0`, action routes to export.

- [ ] **Step 1: Write the failing unit tests**

```ts
// tests/unit/walkState.test.ts
import { test, expect } from 'vitest';
import { visibleRows, nextUnanswered, tagCounts, DEFAULT_WALK_STATE } from '../../src/ui/walk/walkState';
import { allItems, defaultTagsFor } from '../../src/data/checklist';
const tags = new Map(allItems().map(i => [i.id, defaultTagsFor(i.id)]));
const ans = (o: Record<string, any>) => new Map(Object.entries(o).map(([k, result]) => [k, { itemId: k, result, note: '', flagged: false, repeated: false } as any]));
test('sequence rows have headers and all 81 items', () => {
  const rows = visibleRows(DEFAULT_WALK_STATE, new Map(), tags);
  expect(rows.filter(r => r.kind === 'item').length).toBe(81);
  expect(rows.filter(r => r.kind === 'section').length).toBe(3); expect(rows.filter(r => r.kind === 'subsection').length).toBe(14);
  expect(rows[0]).toMatchObject({ kind: 'section', id: 'A' }); expect(rows[1]).toMatchObject({ kind: 'item', id: 'A1' });
});
test('area mode filters by tag, remainingOnly drops answered, empty headers dropped', () => {
  const rows = visibleRows({ ...DEFAULT_WALK_STATE, mode: 'area', tag: 'clinic' }, new Map(), tags);
  expect(rows.map(r => r.id)).toEqual(['B11.1', 'B11.2', 'B11.3', 'B12.1', 'B12.2', 'C2.8']);
  const seq = visibleRows({ ...DEFAULT_WALK_STATE, remainingOnly: true }, ans({ A1: 'full' }), tags);
  expect(seq.find(r => r.id === 'A1')).toBeUndefined();
  const allA = Object.fromEntries(allItems().filter(i => i.sectionId === 'A').map(i => [i.id, 'full']));
  expect(visibleRows({ ...DEFAULT_WALK_STATE, remainingOnly: true }, ans(allA), tags).find(r => r.kind === 'section' && r.id === 'A')).toBeUndefined();
});
test('search mode and next unanswered', () => {
  const rows = visibleRows({ ...DEFAULT_WALK_STATE, mode: 'search', query: 'extinguisher' }, new Map(), tags);
  expect(rows.map(r => r.id)).toEqual(['B9.1']);
  const seq = visibleRows(DEFAULT_WALK_STATE, ans({ A1: 'full', A2: 'no' }), tags);
  expect(nextUnanswered('A1', seq, ans({ A1: 'full', A2: 'no' }))).toBe('A3');
  expect(nextUnanswered('C2.19', seq, ans({ A1: 'full' }))).toBe('A2');
  expect(nextUnanswered(null, seq, ans({}))).toBe('A1');
});
test('tag counts', () => {
  const c = tagCounts(tags, ans({ 'B11.1': 'full' }));
  expect(c.get('clinic')).toEqual({ total: 6, done: 1 });
});
```

- [ ] **Step 2: Write the failing e2e test**

```ts
// tests/e2e/walk.spec.ts
import { test, expect } from '@playwright/test';
async function newAudit(page) { await page.goto('./'); await page.getByRole('button', { name: 'New audit' }).click(); await page.getByLabel('Audit no').fill('HSSEW-004'); await page.getByRole('button', { name: 'Start walk' }).click(); }
test('answer in sequence, see it in area and search, persist offline', async ({ page, context }) => {
  await newAudit(page);
  await expect(page.getByText('0 / 81 answered')).toBeVisible();
  await page.getByRole('button', { name: /^B9\.1/ }).click();
  await page.getByRole('button', { name: 'Partial' }).click();
  await page.getByLabel('Observation note').fill('Extinguisher at gate 2 overdue');
  await page.getByRole('button', { name: 'Flag' }).click();
  await expect(page.getByText('1 / 81 answered')).toBeVisible();
  await page.getByRole('tab', { name: 'Area' }).click();
  await page.getByRole('button', { name: /Fire/ }).click();
  await expect(page.getByRole('button', { name: /^B9\.1/ })).toContainText('Partial');
  await page.getByRole('tab', { name: 'Search' }).click();
  await page.getByRole('searchbox').fill('gate 2');
  await expect(page.getByRole('button', { name: /^B9\.1/ })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('gate 2');
  await page.getByRole('tab', { name: 'Sequence' }).click();
  await page.getByRole('checkbox', { name: 'Remaining only' }).check();
  await expect(page.getByRole('button', { name: /^B9\.1/ })).toBeHidden();
  await context.setOffline(false);
});
test('next unanswered and tag editing', async ({ page }) => {
  await newAudit(page);
  await page.getByRole('button', { name: /^A1 / }).click();
  await page.getByRole('button', { name: 'Full' }).click();
  await page.getByRole('button', { name: 'Next unanswered' }).click();
  await expect(page.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Tags' }).click();
  await page.getByRole('checkbox', { name: 'Fire' }).check();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Fire', { exact: true })).toBeVisible();
});
```

- [ ] **Step 3: Run `npm test` and `npm run e2e`** — Expected: FAIL.

- [ ] **Step 4: Implement `walkState.ts`, components and `Walk.tsx`** per Interfaces. Mode switch uses `role="tablist"`/`role="tab"`; the search input has `type="search"` with label "Search questions"; the collapsed card is a `<button>` whose accessible name starts with the item id and includes the result label; the progress line reads `N / 81 answered`.

- [ ] **Step 5: Run `npm run typecheck && npm test && npm run e2e`** — Expected: PASS.

- [ ] **Step 6: Commit** — `git add src tests && git commit -m "Add Walk screen with sequence, area and search modes"`

---

### Task 11: Photos, memos and dictation in the item card

**Files:**
- Create: `src/ui/components/{MediaStrip,PhotoButton,MemoButton,DictateButton}.tsx`, `src/ui/hooks/useObjectUrl.ts`
- Modify: `src/ui/components/ItemCard.tsx`, `src/ui/components/NoteField.tsx`
- Test: `tests/e2e/media.spec.ts`, `tests/fixtures/photo.jpg` (a real ~100 KB JPEG, e.g. a Playwright screenshot saved as JPEG)

**Interfaces:**
- `PhotoButton { auditId; owner: MediaOwner }` — hidden `<input type="file" accept="image/*" capture="environment" multiple>`, label "Add photo"; each file → `processPhoto` → `repo.addMedia`; `UnsupportedPhotoError` → `toast(err.message)`.
- `MemoButton { auditId; owner }` — label "Record memo" / "Stop recording" with elapsed `m:ss`; on done → `repo.addMedia({ type: 'audio', … })`; `getUserMedia` failure → toast "Microphone blocked — allow it in the browser's site settings".
- `DictateButton { lang; onText(text: string): void; onInterim(text: string): void }` — label "Dictate" / "Stop dictating"; disabled with `title="Needs mobile signal"` when `!dictationAvailable(window, navigator.onLine)`; `network` error → toast "No signal for dictation — record a memo instead".
- `MediaStrip { auditId; owner }` — thumbnails (object URLs from `thumb`) opening a full-size Sheet, audio rows with `<audio controls>` and duration, "Remove" (soft delete) and "Undo" toast action (restore).
- `NoteField` shows interim text in a greyed line below the textarea.

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/media.spec.ts
import { test, expect } from '@playwright/test';
test('photo and memo attach to an item and survive reload', async ({ page }) => {
  await page.goto('./'); await page.getByRole('button', { name: 'New audit' }).click(); await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^B9\.1/ }).click();
  await page.getByLabel('Add photo').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Record memo' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.locator('audio')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: /^B9\.1/ }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible(); await expect(page.locator('audio')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
});
```

- [ ] **Step 2: Run `npm run e2e`** — Expected: FAIL.

- [ ] **Step 3: Implement the components and wire them into `ItemCard`** per Interfaces; revoke object URLs on unmount (`useObjectUrl(data: ArrayBuffer | undefined, mime: string): string | undefined`).

- [ ] **Step 4: Run `npm run typecheck && npm test && npm run e2e`** — Expected: PASS (fake media stream flags from `playwright.config.ts` provide the microphone).

- [ ] **Step 5: Commit** — `git add src tests && git commit -m "Attach photos, voice memos and dictation to checklist items"`

---

### Task 12: Findings and Score screens

**Files:**
- Create: `src/ui/screens/Findings.tsx`, `src/ui/screens/Score.tsx`, `src/ui/components/{ScoreBar,PositiveList}.tsx`
- Test: `tests/e2e/findings-score.spec.ts`

**Interfaces:**
- Findings: header "Negative observations: N · Positive observations: M"; negative list = items with result `no`/`partial` in checklist order, each row: id, question, inline `NoteField`, `MediaStrip`, and a "Missing note" / "Missing photo" chip when absent; tapping the id routes to Walk with that item expanded (`walk:<auditId>` state updated). Positive list: `PositiveList { auditId }` with "Add positive observation" (textarea labelled "Positive observation"), `PhotoButton` per positive, "Remove" (soft delete + Undo).
- Score: `ScoreBar { label; ratio: number | null; detail }` rows for A, B, B1–B12 (indented), C, C1, C2; overall card with percentage, `BAND_LABELS[band]` and "N unanswered — not counted yet".

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/findings-score.spec.ts
import { test, expect } from '@playwright/test';
test('findings list and score reflect answers', async ({ page }) => {
  await page.goto('./'); await page.getByRole('button', { name: 'New audit' }).click(); await page.getByRole('button', { name: 'Start walk' }).click();
  for (const [id, r] of [['A1', 'No'], ['A2', 'Full'], ['A3', 'Partial']] as const) { await page.getByRole('button', { name: new RegExp(`^${id} `) }).click(); await page.getByRole('button', { name: r, exact: true }).click(); }
  await page.getByRole('link', { name: 'Findings' }).click();
  await expect(page.getByText('Negative observations: 2')).toBeVisible();
  await expect(page.getByText('Missing note')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add positive observation' }).click();
  await page.getByLabel('Positive observation').fill('Housekeeping excellent');
  await expect(page.getByText('Positive observations: 1')).toBeVisible();
  await page.getByRole('link', { name: 'Score' }).click();
  await expect(page.getByText('50%').first()).toBeVisible();    // A: (0 + 3 + 1.5) / 9, and overall (only A defined)
  await expect(page.getByText('Non-Compliant')).toBeVisible();
  await expect(page.getByText('78 unanswered')).toBeVisible();
});
```

- [ ] **Step 2: Run `npm run e2e`** — Expected: FAIL.

- [ ] **Step 3: Implement the screens** per Interfaces. Percentages render as `Math.round(ratio * 100) + '%'`, `N/A` when null.

- [ ] **Step 4: Run `npm run typecheck && npm run e2e`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src tests && git commit -m "Add Findings and Score screens"`

---

### Task 13: Export screen — Excel, backup, snapshots, pre-export check

**Files:**
- Create: `src/ui/screens/Export.tsx`, `src/ui/components/{PreflightList,SnapshotList}.tsx`, `src/export/preflight.ts`
- Test: `tests/unit/preflight.test.ts`, `tests/e2e/export.spec.ts`

**Interfaces:**
- Produces (`preflight.ts`, pure): `export interface PreflightIssue { kind: 'unanswered' | 'no-note' | 'header'; ref: string; label: string }` and `export function preflight(audit: Audit, answers: ReadonlyMap<string, Answer>, c?: Checklist): PreflightIssue[]` — unanswered items (`ref` = id), `no`/`partial` with empty note, empty header fields (`ref` = field name, labels "Contractor / WO", "Project name", "Auditors", "Audit date", "Audit no", "Contact number").
- Export screen: **Export Excel** → `const { exportExcel } = await import('../../export/excel')` (lazy chunk) → `saveOrShare(bytes, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')`; **Export backup** → `buildBackup` → `saveOrShare(…, 'application/zip')`; both show the preflight list first in a Sheet with "Export anyway" when issues exist; a line reads `Last exported <relative time>` or `Never exported`; **Mark as final** / **Back to draft**; `SnapshotList` with time, reason, "Restore" (Sheet confirm); "Take snapshot now".

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/preflight.test.ts
import { test, expect } from 'vitest';
import { preflight } from '../../src/export/preflight';
test('lists unanswered, missing notes and empty header fields', () => {
  const audit: any = { header: { contractorWo: 'x', projectName: '', auditors: 'a', auditDate: '2026-10-28', auditNo: 'N', contactNumber: '' } };
  const answers = new Map<string, any>([['A1', { itemId: 'A1', result: 'no', note: '' }], ['A2', { itemId: 'A2', result: 'partial', note: 'ok' }]]);
  const issues = preflight(audit, answers);
  expect(issues.filter(i => i.kind === 'unanswered').length).toBe(79);
  expect(issues.filter(i => i.kind === 'no-note').map(i => i.ref)).toEqual(['A1']);
  expect(issues.filter(i => i.kind === 'header').map(i => i.label)).toEqual(['Project name', 'Contact number']);
});
```
```ts
// tests/e2e/export.spec.ts
import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
test('exports an Excel file with the answers, and a backup zip', async ({ page }) => {
  await page.goto('./'); await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill('HSSEW-004'); await page.getByLabel('Audit date').fill('2026-10-28');
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^A1 / }).click(); await page.getByRole('button', { name: 'No', exact: true }).click();
  await page.getByLabel('Observation note').fill('KPIs not in approved plan');
  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Export Excel' }).click();
  await expect(page.getByText('80 unanswered')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export anyway' }).click()]);
  expect(download.suggestedFilename()).toBe('HSSEW-004-HS-Audit-2026-10-28.xlsx');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await download.path() as string); const ws = wb.worksheets[0];
  expect(ws.getCell('T9').value).toBe('No'); expect(ws.getCell('U9').value).toBe('KPIs not in approved plan'); expect(ws.getCell('Q3').value).toBe('HSSEW-004');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export anyway' }).click()]);
  expect(zip.suggestedFilename()).toBe('HSSEW-004-backup.zip');
  await expect(page.getByText(/Last exported/)).toBeVisible();
});
```

- [ ] **Step 2: Run `npm test` and `npm run e2e`** — Expected: FAIL.

- [ ] **Step 3: Implement `preflight.ts`, the components and `Export.tsx`** per Interfaces. The preflight Sheet summarises counts ("80 unanswered", "1 without a note", "2 header fields empty") above the list.

- [ ] **Step 4: Run `npm run typecheck && npm test && npm run e2e`** — Expected: PASS; `npm run build` shows a separate chunk containing ExcelJS.

- [ ] **Step 5: Commit** — `git add src tests && git commit -m "Add Export screen with Excel, backup, preflight and snapshots"`

---

### Task 14: Settings, desk layout, keyboard, update prompt

**Files:**
- Create: `src/ui/screens/Settings.tsx`, `src/ui/components/TagManager.tsx`, `src/ui/hooks/useKeyboardShortcuts.ts`, `src/pwa/updates.ts`, `src/styles/desk.css`
- Modify: `src/ui/screens/Walk.tsx`, `src/ui/screens/Findings.tsx`, `src/app.tsx`, `src/main.tsx`
- Test: `tests/e2e/settings-desk.spec.ts`

**Interfaces:**
- Settings: select "Dictation language" (`en-US`, `ar-SA`; setting key `dictationLang`), `TagManager` (list, "Add tag" with label input, inline rename), storage card ("Persistent storage: on/off", usage from `navigator.storage.estimate()`, button "Request persistent storage"), app version (`import.meta.env.VITE_APP_VERSION` injected from `package.json` in `vite.config.ts`), "Install to home screen" instructions, "Check for updates".
- `src/pwa/updates.ts`: `registerUpdates(onUpdate: (apply: () => void) => void): void` using `virtual:pwa-register` with `immediate: true`; `main.tsx` shows `toast('Update ready', { action: { label: 'Reload', onClick: apply }, durationMs: 0 })` — never auto-reloads.
- `desk.css`: at `min-width: 900px` Walk and Findings become `grid-template-columns: 360px 1fr` (list | detail); `useKeyboardShortcuts({ onResult(r), onNext(), onPrev(), onFlag() })` maps `1`–`4` to full/partial/no/na, `j`/`k`, `f`, ignored while typing in inputs/textareas.

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/settings-desk.spec.ts
import { test, expect, devices } from '@playwright/test';
test('settings: dictation language and custom tag persist', async ({ page }) => {
  await page.goto('./settings');
  await page.getByLabel('Dictation language').selectOption('ar-SA');
  await page.getByRole('button', { name: 'Add tag' }).click(); await page.getByLabel('Tag name').fill('Welfare'); await page.getByRole('button', { name: 'Save tag' }).click();
  await page.reload();
  await expect(page.getByLabel('Dictation language')).toHaveValue('ar-SA'); await expect(page.getByText('Welfare')).toBeVisible();
});
test.describe('desk layout', () => {
  test.use({ ...devices['Desktop Chrome'], viewport: { width: 1200, height: 800 } });
  test('two panes and keyboard shortcuts', async ({ page }) => {
    await page.goto('./'); await page.getByRole('button', { name: 'New audit' }).click(); await page.getByRole('button', { name: 'Start walk' }).click();
    await page.getByRole('button', { name: /^A1 / }).click();
    await expect(page.getByTestId('walk-detail')).toBeVisible();
    await page.keyboard.press('2'); await expect(page.getByRole('button', { name: 'Partial' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('j'); await expect(page.getByTestId('walk-detail')).toContainText('A2');
    await page.keyboard.press('f'); await expect(page.getByRole('button', { name: 'Flag' })).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run `npm run e2e`** — Expected: FAIL.

- [ ] **Step 3: Implement** per Interfaces; the detail pane has `data-testid="walk-detail"`.

- [ ] **Step 4: Run `npm run typecheck && npm test && npm run e2e`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src tests && git commit -m "Add Settings, desk layout, keyboard shortcuts and update prompt"`

---

### Task 15: PWA icons, offline verification, Pages deployment

**Files:**
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/icons/apple-touch-icon.png` (180 px) — generated from an inline SVG (dark teal `#0F3D3E` rounded square, white "HSE" wordmark) with a one-off Playwright screenshot script in `scripts/make-icons.mjs`
- Modify: `vite.config.ts` (manifest icons, `apple-touch-icon` link in `index.html`)
- Create: `.github/workflows/deploy.yml`, `tests/e2e/offline.spec.ts`
- Modify: `README.md`

**Interfaces:**
- `deploy.yml`: on push to `main`: build (same steps as CI minus e2e), `actions/upload-pages-artifact@v3` with `dist`, `actions/deploy-pages@v4`; permissions `pages: write`, `id-token: write`.
- README gains: enabling Pages (Settings → Pages → Source: GitHub Actions), the first-open-online requirement, and the "Export → share to Teams/Email" flow.

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/offline.spec.ts
import { test, expect } from '@playwright/test';
test('full app loads offline after first visit, including the Excel template', async ({ page, context }) => {
  await page.goto('./'); await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await context.setOffline(true);
  await page.goto('./settings'); await expect(page.getByLabel('Dictation language')).toBeVisible();
  const ok = await page.evaluate(async () => (await fetch('/h-s-audit/templates/hs-audit-template.xlsx')).ok);
  expect(ok).toBe(true);
  await context.setOffline(false);
});
```

- [ ] **Step 2: Run `npm run e2e`** — Expected: FAIL if the template is not precached or SW not registered.

- [ ] **Step 3: Generate icons, update manifest and `index.html`, write `deploy.yml`, update README.**

- [ ] **Step 4: Run `npm run typecheck && npm test && npm run e2e && npm run build`** — Expected: PASS; `dist/manifest.webmanifest` lists the icons; `dist/sw.js` precache includes `templates/hs-audit-template.xlsx`.

- [ ] **Step 5: Commit and push** — `git add -A && git commit -m "Add PWA icons, offline verification and Pages deployment" && git push -u origin ccr-78d2f6ac-bl7a2o`

---

## Self-review notes

- Spec §4.3 "Jump to" sheet → Task 10 (`JumpSheet`); §4.3 tap-selected-result-clears → `ResultControl`; §4.6 share sheet → Task 9 `saveOrShare`; §6.2 persistent storage → Task 9 (request) and Task 14 (status); §6.5 nudge → Task 10; §10 permission-denied copy → Task 11; §11 `404.html` → Task 1 `postbuild`; §13 iOS install hint → Task 1 README and Task 14 Settings.
- Names used across tasks: `repo.*` (Task 4) as listed; `takeSnapshot/startSnapshotTimer` (Task 5) used in Task 10 and 13; `buildBackup/importBackup` (Task 6) used in Tasks 9 and 13; `exportExcel` (Task 7) used in Task 13; `processPhoto/createMemoRecorder/createDictation/dictationAvailable/appendDictated` (Task 8) used in Task 11; `searchItems` (Task 3) used by `visibleRows` (Task 10); `scoreAudit/BAND_LABELS` (Task 3) used in Tasks 7, 12, 13.
