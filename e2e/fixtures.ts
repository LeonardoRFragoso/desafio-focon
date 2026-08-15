import { test as base, type Page, expect } from '@playwright/test';

/**
 * E2E test fixtures for FoconFlow.
 *
 * All tests run against the local Supabase instance (port 54321) with
 * deterministic seed data from supabase/seed-auth.sql and supabase/seed.sql.
 *
 * Test users:
 *   admin@example.com / password123  (admin role)
 *   ana@example.com   / password123  (member role)
 *
 * Test projects:
 *   Residencial Aurora  (active)
 *   Edifício Horizonte  (active)
 */

export const TEST_USERS = {
  admin: { email: 'admin@example.com', password: 'password123' },
  ana: { email: 'ana@example.com', password: 'password123' },
} as const;

/**
 * Login via the UI (real auth flow, no API mocking).
 * Waits for redirect to the role-appropriate dashboard.
 */
async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 15000,
  });
}

/**
 * Logout by clearing auth state.
 * The app stores the Supabase session in localStorage.
 */
async function logout(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('foconflow-auth');
    // Supabase stores auth in sb-<ref>-auth-token
    for (const key of Object.keys(localStorage)) {
      if (key.includes('auth-token')) {
        localStorage.removeItem(key);
      }
    }
  });
  await page.goto('/');
}

export const test = base.extend<{
  adminPage: Page;
  memberPage: Page;
}>({
  adminPage: async ({ page }, use) => {
    await loginViaUI(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
    await use(page);
    await logout(page);
  },
  memberPage: async ({ page }, use) => {
    await loginViaUI(page, TEST_USERS.ana.email, TEST_USERS.ana.password);
    await use(page);
    await logout(page);
  },
});

export { expect };
