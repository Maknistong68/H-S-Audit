import { test, expect } from '@playwright/test';

// No pre-signed session here: these tests start signed out.

test('shows sign in, rejects a wrong password, signs in and out', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel('Email').fill('auditor@test');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is not right')).toBeVisible();
  await page.getByLabel('Password').fill('test1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible(); // the session is kept
  await page.goto('./settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('an invited account without a role sees the not-in-team screen', async ({ page }) => {
  await page.goto('./sign-in');
  await page.getByLabel('Email').fill('invited@test');
  await page.getByLabel('Password').fill('test1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/not in the team yet/)).toBeVisible();
  await expect(page.getByText('invited@test')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('signing in needs a connection', async ({ page, context }) => {
  await page.goto('./sign-in');
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Signing in needs a connection')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

test('forgot password sends a reset link', async ({ page }) => {
  await page.goto('./sign-in');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill('auditor@test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Reset link sent to auditor@test')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __hsFake: { resets(): string[] } }).__hsFake.resets())).toEqual(['auditor@test']);
});
