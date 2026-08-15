import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures';

/**
 * E2E 4: Member delete pending time entry → row disappears
 *
 * A member logs in, creates a time entry, deletes it, and verifies
 * that the row actually disappears from the list.
 */
test.describe('E2E 4: Member delete pending time entry', () => {
  test('member can delete a pending entry and it disappears', async ({ page }) => {
    test.setTimeout(60000);
    // --- Login as member ---
    await page.goto('/login');
    await page.fill('#email', TEST_USERS.ana.email);
    await page.fill('#password', TEST_USERS.ana.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/my-dashboard', { timeout: 15000 });

    // --- Navigate to time entries ---
    await page.goto('/time-entries');
    await page.waitForLoadState('networkidle');

    // --- Create a time entry to delete ---
    const projectSelect = page.locator('#projectId');
    await projectSelect.waitFor({ state: 'visible', timeout: 10000 });
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

    const today = new Date().toISOString().slice(0, 10);
    await page.fill('#entryDate', today);
    await page.fill('#durationMinutes', '30');
    const uniqueDesc = `E2E delete test ${Date.now()}`;
    await page.fill('#description', uniqueDesc);
    await page.click('button[type="submit"]');

    // Wait for the entry to appear
    await expect(
      page.getByText(uniqueDesc).first()
    ).toBeVisible({ timeout: 15000 });

    // --- Delete the entry ---
    // Find the row containing our entry and click the delete button
    const entryRow = page.locator('tr').filter({ hasText: uniqueDesc }).first();
    const deleteButton = entryRow.getByText(/excluir/i).first();
    await deleteButton.click();

    // Confirm deletion in the modal
    // The ConfirmDialog renders a div[role="dialog"] with a confirm button
    // labeled "Excluir" (confirmLabel). Use exact match to avoid matching
    // the row's delete button.
    const confirmButton = page.getByRole('dialog').getByRole('button', { name: /^excluir$/i });
    await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
    await confirmButton.click();

    // --- Verify the entry is gone ---
    await expect(
      page.getByText(uniqueDesc)
    ).not.toBeVisible({ timeout: 10000 });
  });
});
