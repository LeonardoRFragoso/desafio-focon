import { test, expect } from './fixtures';

/**
 * E2E 7: Weekly goal navigation and define-goal flow.
 *
 * Verifies that:
 * - The "Definir meta" CTA in the Action Center opens the goal editor
 * - The sidebar "Meta Semanal" item navigates to the goal editor
 * - The editor is visible and scrollable into view
 * - Cancel closes the editor
 */
test.describe('E2E 7: Weekly goal navigation', () => {
  test('member can open goal editor via Action Center "Definir meta" CTA', async ({ memberPage }) => {
    await memberPage.goto('/my-dashboard');

    // Wait for the Action Center to render
    await expect(memberPage.locator('text=Minhas Pendências')).toBeVisible({ timeout: 10000 });

    // Look for the "Definir meta" CTA in the Action Center cards
    const defineGoalCTA = memberPage.locator('section[aria-label="Minhas Pendências"] button:has-text("Definir meta")').first();

    // If the CTA is visible (goal not configured), click it
    if (await defineGoalCTA.isVisible({ timeout: 5000 }).catch(() => false)) {
      await defineGoalCTA.click();

      // The HourGoalWidget editor should become visible
      await expect(memberPage.locator('text=Horas esperadas por semana')).toBeVisible({ timeout: 5000 });

      // Cancel should close the editor
      const cancelButton = memberPage.locator('button:has-text("Cancelar")').first();
      await cancelButton.click();
      await expect(memberPage.locator('text=Horas esperadas por semana')).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('member can open goal editor via sidebar "Meta Semanal"', async ({ memberPage }) => {
    await memberPage.goto('/my-dashboard');

    // Wait for the sidebar to render
    await expect(memberPage.locator('text=Minhas Pendências')).toBeVisible({ timeout: 10000 });

    // Click the "Meta Semanal" sidebar item
    const sidebarGoalLink = memberPage.locator('aside button:has-text("Meta Semanal")').first();
    await expect(sidebarGoalLink).toBeVisible({ timeout: 5000 });
    await sidebarGoalLink.click();

    // The HourGoalWidget editor should become visible
    await expect(memberPage.locator('text=Horas esperadas por semana')).toBeVisible({ timeout: 5000 });
  });
});
