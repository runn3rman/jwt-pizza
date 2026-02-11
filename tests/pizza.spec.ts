import { test, expect } from 'playwright-test-coverage';
import type { Page } from '@playwright/test';
import { Role, User } from '../src/service/pizzaService';

type InitOptions = {
  sessionUser?: User;
  orders?: Array<{ id: string; date: string; items: Array<{ menuId: number; description: string; price: number }> }>;
  failOrder?: boolean;
};

const dinerUser: User = { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] };
const franchiseeUser: User = { id: '4', name: 'Fran Owner', email: 'f@jwt.com', password: 'franchisee', roles: [{ role: Role.Franchisee, objectId: '2' }] };
const adminUser: User = { id: '1', name: 'Admin User', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] };

function withoutPassword(user?: User) {
  if (!user) {
    return null;
  }
  const { password: _password, ...rest } = user;
  return rest;
}

async function basicInit(page: Page, options: InitOptions = {}) {
  let loggedInUser: User | undefined = options.sessionUser;

  if (options.sessionUser) {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'seed-token');
    });
  }

  const validUsers: Record<string, User> = {
    'd@jwt.com': dinerUser,
    'f@jwt.com': franchiseeUser,
    'a@jwt.com': adminUser,
  };

  const menuRes = [
    {
      id: 1,
      title: 'Veggie',
      image: 'pizza1.png',
      price: 0.0038,
      description: 'A garden of delight',
    },
    {
      id: 2,
      title: 'Pepperoni',
      image: 'pizza2.png',
      price: 0.0042,
      description: 'Spicy treat',
    },
  ];

  const franchiseRes = {
    franchises: [
      {
        id: 2,
        name: 'LotaPizza',
        admins: [{ id: '4', name: 'Fran Owner', email: 'f@jwt.com' }],
        stores: [
          { id: 4, name: 'Lehi', totalRevenue: 0.01 },
          { id: 5, name: 'Springville', totalRevenue: 0.02 },
        ],
      },
      { id: 3, name: 'PizzaCorp', admins: [{ id: '8', name: 'Morgan', email: 'm@jwt.com' }], stores: [{ id: 7, name: 'Spanish Fork', totalRevenue: 0.03 }] },
      { id: 4, name: 'topSpot', admins: [], stores: [] },
    ],
    more: true,
  };

  await page.route('*/**/api/auth', async (route) => {
    const method = route.request().method();

    if (method === 'PUT') {
      const loginReq = route.request().postDataJSON() as { email: string; password: string };
      const user = validUsers[loginReq.email];
      if (!user || user.password !== loginReq.password) {
        await route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
        return;
      }
      loggedInUser = user;
      await route.fulfill({ json: { user: withoutPassword(loggedInUser), token: 'abcdef' } });
      return;
    }

    if (method === 'POST') {
      const registerReq = route.request().postDataJSON() as { name: string; email: string; password: string };
      if (validUsers[registerReq.email]) {
        await route.fulfill({ status: 409, json: { message: 'User exists' } });
        return;
      }
      loggedInUser = { id: '11', name: registerReq.name, email: registerReq.email, roles: [{ role: Role.Diner }] };
      await route.fulfill({ json: { user: loggedInUser, token: 'new-user-token' } });
      return;
    }

    if (method === 'DELETE') {
      loggedInUser = undefined;
      await route.fulfill({ json: {} });
      return;
    }

    await route.fulfill({ status: 405, json: { message: 'Method not allowed' } });
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({ json: withoutPassword(loggedInUser) });
  });

  await page.route('*/**/api/order/menu', async (route) => {
    await route.fulfill({ json: menuRes });
  });

  await page.route(/\/api\/order(\/verify)?$/, async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/verify') && method === 'POST') {
      await route.fulfill({
        json: {
          message: 'valid',
          payload: { sub: 'd@jwt.com', exp: 9999999999 },
        },
      });
      return;
    }

    if (method === 'GET') {
      await route.fulfill({ json: { id: '3', dinerId: '3', orders: options.orders ?? [] } });
      return;
    }

    if (method === 'POST') {
      if (options.failOrder) {
        await route.fulfill({ status: 500, json: { message: 'payment declined' } });
        return;
      }
      const orderReq = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          order: { ...orderReq, id: 23 },
          jwt: 'eyJpYXQ',
        },
      });
      return;
    }

    await route.fulfill({ status: 405, json: { message: 'Method not allowed' } });
  });

  await page.route(/\/api\/franchise(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    if (method === 'GET') {
      if (/\/api\/franchise\/\w+$/.test(url.pathname)) {
        await route.fulfill({ json: [franchiseRes.franchises[0]] });
        return;
      }
      await route.fulfill({ json: franchiseRes });
      return;
    }

    if (method === 'POST') {
      if (url.pathname.endsWith('/store')) {
        const body = route.request().postDataJSON() as { name: string };
        await route.fulfill({ json: { id: 91, name: body.name } });
        return;
      }
      const body = route.request().postDataJSON() as { name: string };
      await route.fulfill({ json: { id: 92, name: body.name, stores: [] } });
      return;
    }

    if (method === 'DELETE') {
      await route.fulfill({ json: {} });
      return;
    }

    await route.fulfill({ status: 405, json: { message: 'Method not allowed' } });
  });

  await page.route(/\/api\/docs$/, async (route) => {
    await route.fulfill({
      json: {
        endpoints: [
          {
            requiresAuth: true,
            method: 'GET',
            path: '/api/order/menu',
            description: 'Get menu',
            example: 'curl /api/order/menu',
            response: menuRes,
          },
        ],
      },
    });
  });

  await page.goto('/');
}

test('home page', async ({ page }) => {
  await basicInit(page);
  await expect(page).toHaveTitle('JWT Pizza');
  await expect(page.getByRole('button', { name: 'Order now' })).toBeVisible();
});

test('login success', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('login failure shows unauthorized message', async ({ page }) => {
  await basicInit(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('wrong');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByText('Unauthorized')).toBeVisible();
});

test('register and navigate to login sibling path', async ({ page }) => {
  await basicInit(page);
  await page.goto('/login');
  await page.locator('main').getByText('Register').click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByPlaceholder('Full name').fill('New User');
  await page.getByPlaceholder('Email address').fill('new@jwt.com');
  await page.getByPlaceholder('Password').fill('pw');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL('/');
});

test('purchase with login and verify delivery jwt', async ({ page }) => {
  await basicInit(page);

  await page.getByRole('button', { name: 'Order now' }).click();
  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
  await expect(page.locator('tfoot')).toContainText('0.008 ₿');
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByText('0.008')).toBeVisible();

  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('JWT Pizza -')).toBeVisible();
  await expect(page.getByText('valid')).toBeVisible();
});

test('payment error branch and cancel branch', async ({ page }) => {
  await basicInit(page, { sessionUser: dinerUser, failOrder: true });
  await page.goto('/menu');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByText('payment declined')).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL('/menu');
});

test('payment redirects to login if unauthenticated', async ({ page }) => {
  await basicInit(page);
  await page.goto('/payment');
  await expect(page).toHaveURL(/\/payment\/login$/);
});

test('diner dashboard with no orders', async ({ page }) => {
  await basicInit(page, { sessionUser: dinerUser, orders: [] });
  await page.goto('/diner-dashboard');
  await expect(page.getByText('How have you lived this long without having a pizza?')).toBeVisible();
});

test('diner dashboard with order history', async ({ page }) => {
  await basicInit(page, {
    sessionUser: dinerUser,
    orders: [{ id: '88', date: '2026-02-11', items: [{ menuId: 1, description: 'Veggie', price: 0.0038 }] }],
  });
  await page.goto('/diner-dashboard');
  await expect(page.getByText('Here is your history of all the good times.')).toBeVisible();
  await expect(page.getByText('88')).toBeVisible();
});

test('franchise dashboard marketing and store creation', async ({ page }) => {
  await basicInit(page);
  await page.goto('/franchise-dashboard');
  await expect(page.getByText('So you want a piece of the pie?')).toBeVisible();

  await basicInit(page, { sessionUser: franchiseeUser });
  await page.goto('/franchise-dashboard');
  await expect(page.getByText('LotaPizza')).toBeVisible();
  await page.getByRole('button', { name: 'Create store' }).click();
  await expect(page).toHaveURL(/\/franchise-dashboard\/create-store$/);
  await page.getByPlaceholder('store name').fill('Mapleton');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL('/franchise-dashboard');

  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByText('Sorry to see you go')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
});