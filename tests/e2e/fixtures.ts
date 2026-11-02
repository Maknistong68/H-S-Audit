import { test as base, expect, type Page } from '@playwright/test';

/**
 * The app is built for tests with VITE_FAKE_REMOTE=1: an in-memory server with fixed users (password test1234).
 * Specs that import `test` from here start signed in as auditor@test; `signInAs` switches account.
 */
export const FAKE_PASSWORD = 'test1234';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      if (!localStorage.getItem('hs:fakeSession')) localStorage.setItem('hs:fakeSession', 'auditor@test');
    });
    await use(context);
  },
});

export { expect };

/** Signs out whoever is signed in and signs in through the form as `email`. */
export async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('./sign-in');
  await page.evaluate(() => localStorage.removeItem('hs:fakeSession'));
  await page.goto('./sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(FAKE_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
