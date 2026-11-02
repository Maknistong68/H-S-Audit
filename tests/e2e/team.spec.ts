import { test, expect, signInAs } from './fixtures';

type Fake = { resets(): string[] };

test('admin invites a new auditor and changes a role', async ({ page }) => {
  await signInAs(page, 'admin@test');
  await page.goto('./settings');
  await page.getByRole('link', { name: 'Manage team' }).click();
  await expect(page).toHaveURL(/\/team$/);
  await page.getByLabel('Email').fill('new@test');
  await page.getByLabel('Role', { exact: true }).selectOption('lead');
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByText('Invitation sent to new@test')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Pending invitations' }).getByText('new@test')).toBeVisible();
  const vic = page.getByRole('listitem').filter({ hasText: 'Vic Viewer' });
  await vic.getByLabel('Role for Vic Viewer').selectOption('auditor');
  await expect(page.getByText('Vic Viewer is now an auditor')).toBeVisible();
  await vic.getByRole('button', { name: 'Remove access' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove access' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Remove access' }).click();
  await expect(page.getByText('Vic Viewer no longer has access')).toBeVisible();
  await expect(vic.getByText('No access')).toBeVisible();
});

test('inviting an existing member offers a sign-in link', async ({ page }) => {
  await signInAs(page, 'admin@test');
  await page.goto('./team');
  await page.getByLabel('Email').fill('auditor@test');
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByText('auditor@test is already a member')).toBeVisible();
  await page.getByRole('button', { name: 'Send sign-in link' }).first().click();
  await expect(page.getByText('Sign-in link sent to auditor@test')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __hsFake: Fake }).__hsFake.resets())).toEqual(['auditor@test']);
});

test('non-admins do not get the Team screen', async ({ page }) => {
  await page.goto('./settings');
  await expect(page.getByLabel('Your name')).toHaveValue('Ola Auditor');
  await expect(page.getByRole('link', { name: 'Manage team' })).toBeHidden();
  await page.goto('./team');
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible(); // sent home
});

test('a member can change their own name', async ({ page }) => {
  await page.goto('./settings');
  const name = page.getByLabel('Your name');
  await expect(name).toHaveValue('Ola Auditor');
  await name.fill('Ola A. Auditor');
  await name.blur();
  await expect(page.getByText('Name saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Your name')).toHaveValue('Ola A. Auditor');
});
