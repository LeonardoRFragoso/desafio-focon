import { test, expect } from '@playwright/test';

/**
 * E2E 2: Protected route redirect
 *
 * Verifies that unauthenticated users are redirected away from
 * protected routes (cannot access /dashboard or /time-entries
 * without logging in).
 */
test.describe('E2E 2: Protected route redirect', () => {
  test('unauthenticated user cannot access /dashboard', async ({ page }) => {
    // Clear any existing auth state
    await page.goto('/');
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('auth-token') || key.includes('auth')) {
          localStorage.removeItem(key);
        }
      }
    });

    // Try to access a protected admin route
    await page.goto('/dashboard');

    // Should be redirected away from /dashboard
    // (to /login or /access-denied, or shown an auth prompt)
    await page.waitForURL(
      (url) => url.pathname !== '/dashboard',
      { timeout: 10000 }
    );
    const currentPath = page.url();
    expect(currentPath).not.toContain('/dashboard');
  });

  test('unauthenticated user cannot access /time-entries', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('auth-token') || key.includes('auth')) {
          localStorage.removeItem(key);
        }
      }
    });

    await page.goto('/time-entries');

    await page.waitForURL(
      (url) => url.pathname !== '/time-entries',
      { timeout: 10000 }
    );
    const currentPath = page.url();
    expect(currentPath).not.toContain('/time-entries');
  });
});
