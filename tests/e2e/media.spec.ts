import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from './fixtures';

type Fake = {
  setOnline(v: boolean): void;
  teammate(who: string, changes: unknown[]): void;
  putPhoto(path: string, data: ArrayBuffer): void;
  uploaded(): string[];
};
const setOnline = (page: Page, online: boolean) =>
  page.evaluate((v: boolean) => {
    (window as unknown as { __hsFake: Fake }).__hsFake.setOnline(v);
    window.dispatchEvent(new Event(v ? 'online' : 'offline'));
  }, online);

test('photo attaches to an item and survives reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^B9\.1/ }).click();
  // Adding a photo also drops a copy into the phone's Downloads (gallery on Android)
  const [copy] = await Promise.all([page.waitForEvent('download'), page.getByLabel('Add photo').setInputFiles('tests/fixtures/photo.jpg')]);
  expect(copy.suggestedFilename()).toMatch(/^audit_B9-1_\d{8}-\d{6}\.jpg$/);
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share photo 1' })).toBeVisible();
  await page.reload();
  const head = page.getByRole('button', { name: /^B9\.1/ });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click(); // the expanded card is remembered across reloads
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
});

test('a photo shows "Waiting to upload" until it reaches the server', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^A1 / }).click();
  await setOnline(page, false);
  await page.getByLabel('Add photo').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await expect(page.getByLabel('Waiting to upload')).toBeVisible();
  await setOnline(page, true);
  await expect(page.getByLabel('Waiting to upload')).toBeHidden({ timeout: 10_000 });
  expect(await page.evaluate(() => (window as unknown as { __hsFake: Fake }).__hsFake.uploaded())).toHaveLength(1);
});

test("a teammate's photo arrives as a thumbnail and downloads in full when opened", async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill('HSSEW-060');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const id = /\/audit\/([^/]+)\//.exec(page.url())![1];
  await page.getByRole('button', { name: 'Start walk' }).click();
  await expect(page.getByRole('button', { name: /^A1 / })).toBeVisible();
  const jpeg = Array.from(await readFile('tests/fixtures/photo.jpg'));
  const thumb = Array.from(await readFile('tests/fixtures/pixel.jpg')).map((b) => String.fromCharCode(b)).join('');
  await page.evaluate(
    ({ id, at, jpeg, thumb }) => {
      const fake = (window as unknown as { __hsFake: Fake }).__hsFake;
      fake.putPhoto(`${id}/44444444-4444-4444-8444-444444444444.jpg`, new Uint8Array(jpeg).buffer);
      fake.teammate('lead', [
        {
          table: 'hs_photos',
          key: { id: '44444444-4444-4444-8444-444444444444' },
          fields: { audit_id: id, owner_kind: 'item', owner_id: 'A1', mime: 'image/jpeg', bytes: jpeg.length, width: 640, height: 480, thumb: btoa(thumb), storage_path: `${id}/44444444-4444-4444-8444-444444444444.jpg`, uploaded_at: at, created_at: at },
          at,
        },
      ]);
    },
    { id, at: Date.now() + 1000, jpeg, thumb },
  );
  await page.getByRole('button', { name: /^A1 / }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel('Waiting to upload')).toBeHidden();
  await page.getByRole('img', { name: 'Photo 1' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1, full size' })).toBeVisible({ timeout: 10_000 });
  const size = await page.getByRole('img', { name: 'Photo 1, full size' }).evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(size).toBeGreaterThan(100); // the real file, not the 1 px thumbnail
});

