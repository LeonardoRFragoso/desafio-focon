import { test, expect } from '@playwright/test';
import { seedDemoData, loginAs } from './fixtures';

test.describe('P17 — E2E expansion: new features', () => {
  test.beforeEach(async ({ page }) => {
    await seedDemoData();
    await page.goto('/');
  });

  // ========================================================================
  // A. DASHBOARD — Project Health Consistency
  // ========================================================================
  test('A) Dashboard shows consistent project health across widgets', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('/dashboard');

    // Wait for both widgets to load
    await page.waitForSelector('text=Projetos que exigem atenção');
    await page.waitForSelector('text=Saúde dos Projetos');

    // Get project names from "Projetos que exigem atenção"
    const attentionProjects = await page
      .locator('section:has-text("Projetos que exigem atenção") table tbody tr')
      .count();

    // Get project names from "Saúde dos Projetos"
    const healthProjects = await page
      .locator('section:has-text("Saúde dos Projetos") table tbody tr')
      .count();

    // Both should show the same projects (derived from same RPC)
    expect(attentionProjects).toBe(healthProjects);
    expect(attentionProjects).toBeGreaterThan(0);

    // Verify no "Nenhum projeto cadastrado" message (we have demo data)
    const emptyMsg = await page.locator('text=Nenhum projeto cadastrado').count();
    expect(emptyMsg).toBe(0);
  });

  // ========================================================================
  // B. CREATE + ATTACHMENT
  // ========================================================================
  test('B) Create time entry with attachment, edit, verify attachment persists', async ({ page }) => {
    await loginAs(page, 'ana@example.com');
    await page.goto('/time-entries');

    // Click create button
    await page.click('button:has-text("Novo apontamento")');

    // Fill form
    await page.selectOption('select[id*="projectId"]', { label: /Residencial Aurora/ });
    await page.fill('input[id*="entryDate"]', '2026-08-15');
    await page.fill('input[id*="durationMinutes"]', '8');
    await page.fill('textarea[id*="description"]', 'Test entry with attachment');

    // Add attachment (create a test file)
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      await fileInput.setInputFiles({
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Test attachment content'),
      });

      // Wait for file to appear in pending list
      await page.waitForSelector('text=test.txt');
    }

    // Submit
    await page.click('button:has-text("Criar")');

    // Wait for success
    await page.waitForSelector('text=Apontamento criado com sucesso');

    // Navigate to list
    await page.goto('/time-entries');

    // Find the entry and click edit
    await page.click('button:has-text("Editar"):first');

    // Verify attachment is still there
    await page.waitForSelector('text=test.txt');
    expect(await page.locator('text=test.txt').count()).toBeGreaterThan(0);
  });

  // ========================================================================
  // C. RETROACTIVE REASON
  // ========================================================================
  test('C) Create entry without reason when not required, with reason when required', async ({ page }) => {
    await loginAs(page, 'ana@example.com');
    await page.goto('/time-entries');

    // Create entry for today (no reason required)
    await page.click('button:has-text("Novo apontamento")');
    await page.selectOption('select[id*="projectId"]', { label: /Residencial Aurora/ });
    await page.fill('input[id*="entryDate"]', '2026-08-16'); // today
    await page.fill('input[id*="durationMinutes"]', '4');
    await page.fill('textarea[id*="description"]', 'Today entry');

    // Verify no late reason field visible
    const lateReasonField = page.locator('textarea[id*="lateSubmissionReason"]');
    expect(await lateReasonField.isVisible()).toBe(false);

    // Submit
    await page.click('button:has-text("Criar")');
    await page.waitForSelector('text=Apontamento criado com sucesso');

    // Create entry for 5 days ago (reason required)
    await page.goto('/time-entries');
    await page.click('button:has-text("Novo apontamento")');
    await page.selectOption('select[id*="projectId"]', { label: /Residencial Aurora/ });
    await page.fill('input[id*="entryDate"]', '2026-08-11'); // 5 days ago
    await page.fill('input[id*="durationMinutes"]', '4');
    await page.fill('textarea[id*="description"]', 'Old entry');

    // Verify late reason field is visible
    await page.waitForSelector('textarea[id*="lateSubmissionReason"]');
    const lateField = page.locator('textarea[id*="lateSubmissionReason"]');
    expect(await lateField.isVisible()).toBe(true);

    // Try to submit without reason — should fail
    await page.click('button:has-text("Criar")');
    await page.waitForSelector('text=Justificativa retroativa é obrigatória');

    // Add reason and submit
    await page.fill('textarea[id*="lateSubmissionReason"]', 'Estava em férias');
    await page.click('button:has-text("Criar")');
    await page.waitForSelector('text=Apontamento criado com sucesso');
  });

  // ========================================================================
  // D. APPROVE CONFIRMATION
  // ========================================================================
  test('D) Approve confirmation dialog: cancel preserves pending, confirm approves', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('/admin/time-entries');

    // Find a pending entry and click approve
    await page.click('button:has-text("Aprovar"):first');

    // Confirmation dialog should appear
    await page.waitForSelector('text=Confirmar aprovação');

    // Click cancel
    await page.click('button:has-text("Cancelar")');

    // Dialog closes, entry still pending
    const pendingBadge = page.locator('span:has-text("Pendente")').first();
    expect(await pendingBadge.isVisible()).toBe(true);

    // Try again, this time confirm
    await page.click('button:has-text("Aprovar"):first');
    await page.waitForSelector('text=Confirmar aprovação');
    await page.click('button:has-text("Confirmar")');

    // Wait for success toast
    await page.waitForSelector('text=Apontamento aprovado com sucesso');

    // Entry should now be approved
    const approvedBadge = page.locator('span:has-text("Aprovado")').first();
    expect(await approvedBadge.isVisible()).toBe(true);
  });

  // ========================================================================
  // E. REJECT WITH REASON
  // ========================================================================
  test('E) Reject entry with reason required', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('/admin/time-entries');

    // Find a pending entry and click reject
    await page.click('button:has-text("Rejeitar"):first');

    // Confirmation dialog should appear with reason field
    await page.waitForSelector('text=Confirmar rejeição');
    await page.waitForSelector('textarea[id*="rejectionReason"]');

    // Try to confirm without reason — should fail
    await page.click('button:has-text("Confirmar")');
    await page.waitForSelector('text=Motivo da rejeição é obrigatório');

    // Add reason and confirm
    await page.fill('textarea[id*="rejectionReason"]', 'Dados inconsistentes');
    await page.click('button:has-text("Confirmar")');

    // Wait for success toast
    await page.waitForSelector('text=Apontamento rejeitado com sucesso');

    // Entry should now be rejected
    const rejectedBadge = page.locator('span:has-text("Rejeitado")').first();
    expect(await rejectedBadge.isVisible()).toBe(true);
  });

  // ========================================================================
  // F. ACCOUNTING PERIODS
  // ========================================================================
  test('F) Accounting periods: open and closed visible, close via dialog', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('/admin/periods');

    // Wait for table
    await page.waitForSelector('table tbody tr');

    // Should see both open and closed periods
    const openBadge = page.locator('span:has-text("Aberto")').first();
    const closedBadge = page.locator('span:has-text("Fechado")').first();

    expect(await openBadge.isVisible()).toBe(true);
    expect(await closedBadge.isVisible()).toBe(true);

    // Click close on an open period
    const openRow = page.locator('tr:has-text("Aberto")').first();
    await openRow.locator('button:has-text("Fechar")').click();

    // Confirmation dialog
    await page.waitForSelector('text=Confirmar fechamento');
    await page.click('button:has-text("Confirmar")');

    // Wait for success
    await page.waitForSelector('text=Período fechado com sucesso');

    // Period should now show as closed
    const closedStatus = openRow.locator('span:has-text("Fechado")');
    expect(await closedStatus.isVisible()).toBe(true);
  });

  // ========================================================================
  // G. PROJECT BUDGETS
  // ========================================================================
  test('G) Project budgets display with correct schema (budget_type, fiscal_year)', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('/admin/budget');

    // Wait for table
    await page.waitForSelector('table tbody tr');

    // Should see budget entries with budget_type labels
    const laborHours = page.locator('text=Horas de trabalho');
    const laborCost = page.locator('text=Custo de mão de obra');
    const totalCost = page.locator('text=Custo total');

    // At least one of each type should be visible (from demo data)
    expect(await laborHours.count()).toBeGreaterThan(0);
    expect(await laborCost.count()).toBeGreaterThan(0);
    expect(await totalCost.count()).toBeGreaterThan(0);

    // Verify fiscal_year column exists
    const fiscalYearHeader = page.locator('th:has-text("Ano Fiscal")');
    expect(await fiscalYearHeader.isVisible()).toBe(true);
  });

  // ========================================================================
  // H. PROFITABILITY ALERTS
  // ========================================================================
  test('H) Profitability alerts: config alerts visible, acknowledge works', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('/admin/alerts');

    // Wait for table
    await page.waitForSelector('table tbody tr');

    // Should see alert entries
    const alertRows = page.locator('table tbody tr');
    expect(await alertRows.count()).toBeGreaterThan(0);

    // Should see metric labels
    const marginAlert = page.locator('text=Margem');
    const budgetAlert = page.locator('text=Utilização do orçamento');

    expect(await marginAlert.count()).toBeGreaterThan(0);
    expect(await budgetAlert.count()).toBeGreaterThan(0);

    // Click acknowledge on first alert
    await page.click('button:has-text("Reconhecer"):first');

    // Wait for success
    await page.waitForSelector('text=Alerta reconhecido com sucesso');

    // Alert should now show as resolved
    const resolvedBadge = page.locator('span:has-text("Resolvido")').first();
    expect(await resolvedBadge.isVisible()).toBe(true);
  });

  // ========================================================================
  // I. AUDIT LOG UX
  // ========================================================================
  test('I) Audit log: human-readable titles, technical section collapsed, no raw JSON', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('/admin/audit');

    // Wait for table
    await page.waitForSelector('table tbody tr');

    // Click on an audit entry
    await page.click('button:has-text("Detalhes"):first');

    // Modal should open
    await page.waitForSelector('text=Informações técnicas');

    // Should see human-readable action (event-based wording)
    const actionBadge = page.locator('span.inline-block').first();
    const actionText = await actionBadge.textContent();
    expect(actionText).toMatch(/aprovado|rejeitado|fechado|reaberto/i);

    // Technical section should be collapsed by default
    const technicalSection = page.locator('div:has-text("ID da entidade")');
    expect(await technicalSection.isVisible()).toBe(false);

    // Click to expand
    await page.click('button:has-text("Informações técnicas")');

    // Now should be visible
    expect(await technicalSection.isVisible()).toBe(true);

    // Should have copy ID button
    const copyButton = page.locator('button:has-text("Copiar ID")');
    expect(await copyButton.count()).toBeGreaterThan(0);

    // Should NOT show raw JSON as primary content
    const primaryContent = page.locator('div.space-y-6 > div:first-child');
    const primaryText = await primaryContent.textContent();
    expect(primaryText).not.toMatch(/\{.*\}/); // no JSON in primary area
  });
});
