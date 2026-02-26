import { test, expect } from 'playwright-test-coverage';
import type { Page } from '@playwright/test';
import { Role, User } from '../src/service/pizzaService';

test('updateUser', async ({ page }) => {
  await initUserUpdate(page, { id: '21', name: 'pizza diner', email: 'user@jwt.com', password: 'diner', roles: [{ role: Role.Diner }] });

  await expect(page.getByRole('main')).toContainText('pizza diner');

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');
  await page.getByRole('textbox').first().fill('pizza dinerx');
  await page.getByRole('button', { name: 'Update' }).click();

  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await expect(page.getByRole('main')).toContainText('pizza dinerx');

  await page.getByRole('link', { name: 'Logout' }).click();
  await page.getByRole('link', { name: 'Login' }).click();

  await page.getByRole('textbox', { name: 'Email address' }).fill('user@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'pd' }).click();

  await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

function withoutPassword(user?: User) {
  if (!user) {
    return null;
  }
  const { password: _password, ...rest } = user;
  return rest;
}

async function initUserUpdate(page: Page, startingUser: User) {
  let loggedInUser: User | undefined = { ...startingUser };

  await page.addInitScript(() => {
    localStorage.setItem('token', 'seed-token');
  });

  await page.route('*/**/api/auth', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const loginReq = route.request().postDataJSON() as { email: string; password: string };
      if (!loggedInUser || loginReq.email !== loggedInUser.email || loginReq.password !== loggedInUser.password) {
        await route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
        return;
      }
      await route.fulfill({ json: { user: withoutPassword(loggedInUser), token: 'next-token' } });
      return;
    }

    if (method === 'DELETE') {
      await route.fulfill({ json: {} });
      return;
    }

    await route.fulfill({ status: 405, json: { message: 'Method not allowed' } });
  });

  await page.route('*/**/api/user/*', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fulfill({ status: 405, json: { message: 'Method not allowed' } });
      return;
    }

    const body = route.request().postDataJSON() as User;
    loggedInUser = {
      id: body.id,
      name: body.name,
      email: body.email,
      password: body.password || loggedInUser?.password,
      roles: body.roles,
    };
    await route.fulfill({ json: { user: withoutPassword(loggedInUser), token: 'updated-token' } });
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({ json: withoutPassword(loggedInUser) });
  });

  await page.route('*/**/api/order', async (route) => {
    await route.fulfill({ json: { id: startingUser.id, dinerId: startingUser.id, orders: [] } });
  });

  await page.goto('/diner-dashboard');
}

test('updateUser changes password', async ({ page }) => {
  await initUserUpdate(page, { id: '31', name: 'Kai Chen', email: 'kai@jwt.com', password: 'oldPass', roles: [{ role: Role.Diner }] });

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox').nth(2).fill('newPass');
  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await page.getByRole('link', { name: 'Logout' }).click();
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('kai@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('oldPass');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByText('Unauthorized')).toBeVisible();

  await page.getByRole('textbox', { name: 'Password' }).fill('newPass');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('updateUser changes email', async ({ page }) => {
  await initUserUpdate(page, { id: '41', name: 'Mia Park', email: 'mia@jwt.com', password: 'pw', roles: [{ role: Role.Diner }] });

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox').nth(1).fill('mia.new@jwt.com');
  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });
  await expect(page.getByRole('main')).toContainText('mia.new@jwt.com');

  await page.getByRole('link', { name: 'Logout' }).click();
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('mia@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('pw');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByText('Unauthorized')).toBeVisible();

  await page.getByRole('textbox', { name: 'Email address' }).fill('mia.new@jwt.com');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('link', { name: 'MP' })).toBeVisible();
});

test('updateUser with franchisee role keeps role and allows info change', async ({ page }) => {
  await initUserUpdate(page, { id: '51', name: 'Fran Owner', email: 'f@jwt.com', password: 'franchisee', roles: [{ role: Role.Franchisee, objectId: '2' }] });

  await expect(page.getByRole('main')).toContainText('Franchisee on 2');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox').first().fill('Fran Owner II');
  await page.getByRole('textbox').nth(1).fill('fran2@jwt.com');
  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await expect(page.getByRole('main')).toContainText('Fran Owner II');
  await expect(page.getByRole('main')).toContainText('fran2@jwt.com');
  await expect(page.getByRole('main')).toContainText('Franchisee on 2');
});

test('updateUser with admin role keeps role and allows info change', async ({ page }) => {
  await initUserUpdate(page, { id: '61', name: 'Admin User', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] });

  await expect(page.getByRole('main')).toContainText('admin');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox').first().fill('Admin Prime');
  await page.getByRole('textbox').nth(1).fill('admin.prime@jwt.com');
  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await expect(page.getByRole('main')).toContainText('Admin Prime');
  await expect(page.getByRole('main')).toContainText('admin.prime@jwt.com');
  await expect(page.getByRole('main')).toContainText('admin');
});
