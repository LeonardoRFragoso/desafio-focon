import { test, expect } from '@playwright/test';
import { TEST_USERS, businessTodayStr } from './fixtures';

/**
 * E2E 5: Admin approve/reject → change persisted
 *
 * An admin logs in, finds a pending time entry, approves it,
 * and verifies that the status change is persisted (entry no longer
 * shows as pending, shows as approved).
 */
test.describe('E2E 5: Admin approve time entry', () => {
  test('admin can approve a pending entry and status persists', async ({ page }) => {
    test.setTimeout(120000);

    // --- Step 1: Login as member and create a pending entry ---
    await page.goto('/login');
    await page.fill('#email', TEST_USERS.ana.email);
    await page.fill('#password', TEST_USERS.ana.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/my-dashboard', { timeout: 15000 });

    await page.goto('/time-entries');
    await page.waitForLoadState('networkidle');

    // Create a pending entry
    const projectSelect = page.locator('#te-projectId');
    await projectSelect.waitFor({ state: 'visible', timeout: 10000 });
    const options = await projectSelect.locator('option').all();
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') {
        await projectSelect.selectOption(val);
        break;
      }
    }

    const today = businessTodayStr();
    await page.fill('#te-entryDate', today);
    await page.fill('#te-durationMinutes', '45');
    const uniqueDesc = `E2E approve test ${Date.now()}`;
    await page.fill('#te-description', uniqueDesc);
    await page.click('button[type="submit"]');

    // Wait for entry to appear
    await expect(
      page.getByText(uniqueDesc).first()
    ).toBeVisible({ timeout: 15000 });

    // --- Clear auth state and logout before logging in as admin ---
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('auth-token') || key.includes('auth')) localStorage.removeItem(key);
      }
    });

    // --- Step 2: Login as admin and approve the entry ---
    await page.goto('/login');
    await page.fill('#email', TEST_USERS.admin.email);
    await page.fill('#password', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Navigate to admin time entries / approval page
    await page.goto('/admin/time-entries');
    await page.waitForLoadState('networkidle');

    // The admin table has no description column, so filter by searching
    // for the unique description in the textual search box.
    const searchBox = page.getByPlaceholder(/buscar por profissional, projeto ou descrição/i);
    await searchBox.fill(uniqueDesc);
    // Wait for the filtered results to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // After filtering, only the matching entry should be visible.
    // Find its row (the only one with an "Aprovar" button) and approve it.
    const approveButton = page.getByRole('button', { name: /^aprovar$/i }).first();
    await expect(approveButton).toBeVisible({ timeout: 15000 });
    await approveButton.click();

    // A confirmation dialog now appears — click the confirm button inside it.
    // The dialog has a title "Aprovar Apontamento" and a confirm button "Aprovar".
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    const confirmButton = confirmDialog.getByRole('button', { name: /^aprovar$/i });
    await confirmButton.click();

    // Wait for the status to change — the "Aprovar" button should disappear
    // once the entry is no longer pending.
    await page.waitForTimeout(2000); // Allow time for the API call + UI update

    // Verify the approve button is gone (entry no longer pending)
    await expect(
      page.getByRole('button', { name: /^aprovar$/i })
    ).toHaveCount(0, { timeout: 10000 });

    // --- Step 3: Verify persistence — clear admin auth, login as member again ---
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('auth-token') || key.includes('auth')) localStorage.removeItem(key);
      }
    });

    await page.goto('/login');
    await page.fill('#email', TEST_USERS.ana.email);
    await page.fill('#password', TEST_USERS.ana.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/my-dashboard', { timeout: 15000 });

    await page.goto('/time-entries');
    await page.waitForLoadState('networkidle');

    // The entry should show as approved (not pending)
    const memberEntryRow = page.locator('tr').filter({ hasText: uniqueDesc }).first();
    await expect(memberEntryRow).toBeVisible({ timeout: 15000 });
    await expect(
      memberEntryRow.getByText(/aprovado/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
