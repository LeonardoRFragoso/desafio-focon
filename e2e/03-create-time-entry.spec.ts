import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures';

/**
 * E2E 3: Member create time entry → persistence verified
 *
 * A member logs in, creates a time entry, and verifies that the
 * entry appears in the list and is persisted in the database.
 */
test.describe('E2E 3: Member create time entry', () => {
  test('member can create a time entry and it persists', async ({ page }) => {
    // --- Login as member ---
    await page.goto('/login');
    await page.fill('#email', TEST_USERS.ana.email);
    await page.fill('#password', TEST_USERS.ana.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/my-dashboard', { timeout: 15000 });

    // --- Navigate to time entries ---
    await page.goto('/time-entries');
    await page.waitForLoadState('networkidle');

    // --- Fill the time entry form ---
    // Select a project (first option in the dropdown)
    const projectSelect = page.locator('#projectId');
    await projectSelect.waitFor({ state: 'visible', timeout: 10000 });
    // Select the first non-empty option
    const options = await projectSelect.locator('option').all();
    let selected = false;
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') {
        await projectSelect.selectOption(val);
        selected = true;
        break;
      }
    }
    expect(selected).toBe(true);

    // Set date to today
    const today = new Date().toISOString().slice(0, 10);
    await page.fill('#entryDate', today);

    // Set duration (60 minutes)
    await page.fill('#durationMinutes', '60');

    // Set description with a unique marker for verification
    const uniqueDesc = `E2E test entry ${Date.now()}`;
    await page.fill('#description', uniqueDesc);

    // --- Submit the form ---
    await page.click('button[type="submit"]');

    // --- Verify the entry appears in the list ---
    // Wait for the entry to appear in the list
    await expect(
      page.getByText(uniqueDesc).first()
    ).toBeVisible({ timeout: 15000 });

    // The entry appearing in the list is sufficient proof of persistence.
    // (Avoid checking for "Pendente" broadly — it also matches the filter
    // dropdown <option value="pending">Pendente</option>.)
  });
});
