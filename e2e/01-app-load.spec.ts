import { test, expect } from '@playwright/test';

/**
 * E2E 1: Application load / login page
 *
 * Verifies that the app loads and the login page is accessible
 * with the correct language attribute and form elements.
 */
test.describe('E2E 1: App load / login page', () => {
  test('login page loads with correct lang and form elements', async ({ page }) => {
    await page.goto('/login');

    // Verify HTML lang attribute
    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('pt-BR');

    // Verify page title
    await expect(page).toHaveTitle(/FoconFlow/);

    // Verify login form elements are present
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('root path redirects appropriately', async ({ page }) => {
    await page.goto('/');
    // Root should either show landing or redirect to login
    // The app's RootPage handles this
    await page.waitForLoadState('networkidle');
    // Verify we're on a valid route (not a blank page)
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // The page should have some content (not just an empty div)
    const text = await body.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(0);
  });
});
