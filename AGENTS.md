# FoconFlow — Agent Notes

## Project commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — ESLint `--max-warnings=0`
- `npm run typecheck` — `tsc -b --noEmit`
- `npm run test` — Vitest run
- `npm run test:coverage` — Vitest with coverage
- `npm run test:e2e` — Playwright
- `bash scripts/test-database.sh` — DB/RLS suites (requires `supabase start` + `supabase db reset`)
- `bash scripts/test-edge-function.sh` — Deno check + lint on edge functions

## CI gates (`.github/workflows/ci.yml`)

Single workflow, three jobs:
1. **frontend** — lint --max-warnings=0, typecheck, unit tests, coverage, build, `npm audit --audit-level=high`
2. **database** — fresh Supabase local, migrations, SQL/RLS suites via `scripts/test-database.sh`
3. **edge** — Deno check + lint via `scripts/test-edge-function.sh`
4. **e2e** — Playwright against local Supabase + Vite preview

Never use `|| true` to bypass a quality gate.

## Supabase

- Production project ref: `ldjkblrsicecyeithkgo` (desafio-focon, São Paulo)
- Linked locally via `supabase link`
- Migrations reconciled local ↔ remote through `20240824070000_fix_function_grants.sql`
- Never `db reset` on production. Apply migrations incrementally only.

## Timezone

Canonical business timezone is `America/Sao_Paulo`. Reuse existing temporal logic; do not recompute.

## P2 — Supabase key format audit (2026-08-16)

Audited during post-hardening product consistency round. No changes made (no functional impact).

Findings:
1. **Frontend production uses JWT-format legacy anon key** (`eyJhb...`), confirmed via production bundle. NOT the new `sb_publishable_...` format. `src/lib/supabase/client.ts` reads `VITE_SUPABASE_ANON_KEY` and passes it to `createClient`; supabase-js v2.112.x accepts both formats, so the app keeps working.
2. **Edge function `invite-user`** reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from Deno env. These are server-side secrets managed in the Supabase dashboard / edge function env.
3. **Provisioning script** (`scripts/provision-remote-demo.mjs`) uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.provision.local`.
4. **E2E** uses the standard local Supabase demo anon JWT (public, bundled in `playwright.config.ts`).
5. **No `sb_publishable_` / `sb_secret_` keys found anywhere** in repo config, scripts, or production bundle.

Risk:
- Supabase is migrating to the new key format. Legacy JWT anon/service_role keys may eventually be deprecated. Some legacy JWT keys were already rejected by certain auth endpoints in local tooling (per rollout notes). Production data API still works with the legacy anon key.

Recommended (do NOT swap blindly):
- Migrate `VITE_SUPABASE_ANON_KEY` (Vercel env + local `.env.local`) to the project's `sb_publishable_...` key after confirming supabase-js compatibility and that all auth flows still work on a preview deploy.
- Migrate edge function `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` to `sb_secret_...` equivalents via the Supabase dashboard, verifying the invite-user flow end-to-end.
- Update `.env.example` / README guidance to reference the new format once migrated.

Status: **P2 — documented, no functional impact now, defer until Supabase enforces new format.**

## P15 — Time Entry Form Flow Inventory (2026-08-16)

All flows that create or edit a time_entry. All use the canonical `useTimeEntryForm` hook and `TimeEntryFields` component.

| Flow | Component | How | Schema | Temporal Rule | Attachment | Late Reason | Notes |
|------|-----------|-----|--------|---------------|-----------|------------|-------|
| **Normal Create** | `TimeEntryForm.tsx` | `timeEntriesAPI.create()` | All fields | ✓ enforced | ✓ yes | ✓ yes | Page at `/time-entries` |
| **Edit** | `TimeEntryList.tsx` (EditEntryModal) | `timeEntriesAPI.update()` | All fields | ✓ enforced | ✓ yes (AttachmentsPanel) | ✓ yes | Modal in list view |
| **Duplicate** | `TimeEntryList.tsx` (DuplicateEntryModal) | `timeEntriesAPI.duplicate()` | Copy project, duration, description; new date | ✓ enforced on new date | ✗ no | ✓ yes | Modal in list view |
| **Timer** | `Timer.tsx` | `timeEntriesAPI.create()` | All fields | ✓ disableLateReasonWatch=true (always today) | ✗ no | ✗ no | Floating timer widget |
| **Quick Entry** | `QuickEntryModal.tsx` | `timeEntriesAPI.create()` | All fields | ✓ enforced | ✗ no | ✓ yes | Modal from dashboard |
| **Weekly Calendar** | `WeeklyCalendar.tsx` | `timeEntriesAPI.create()` | All fields | ✓ enforced | ✗ no | ✓ yes | Calendar view, click to create |
| **Recurring Rule** | `RecurringRulesPage.tsx` | `recurringRulesAPI.create()` (RPC) | Creates rule, not entry | N/A | N/A | N/A | Admin page, creates rule that auto-generates entries |

**Canonical form**: `useTimeEntryForm()` + `TimeEntryFields` component. All flows except Timer use full late-reason enforcement. Timer always uses today (disableLateReasonWatch=true). Duplicate copies project/duration/description but forces new date with fresh late-reason check.

**Attachment support**: Only Normal Create and Edit flows support attachments (via `AttachmentsPanel` or `PendingAttachments`). Other flows do not expose attachment UI.

**All flows use the same schema** (`timeEntrySchema` in `src/schemas/time-entry.ts`):
- `projectId` (required)
- `entryDate` (required, YYYY-MM-DD)
- `durationMinutes` (required, > 0)
- `description` (optional)
- `lateSubmissionReason` (optional, required if 3+ days late)

## P16 — Mutation/Action Confirmation & Feedback Inventory (2026-08-16)

All destructive or significant state-changing actions. Includes confirmation, loading, success, and error feedback.

| Action | Component | Pre-Confirm | Loading | Success | Error | Partial Fail | Notes |
|--------|-----------|-------------|---------|---------|-------|--------------|-------|
| **Approve time entry** | `TimeEntryApproval.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | Single entry |
| **Batch approve** | `AdminTimeEntriesPage.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | ⚠ possible | Multiple entries, RPC |
| **Reject time entry** | `TimeEntryApproval.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | Requires reason |
| **Batch reject** | `AdminTimeEntriesPage.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | ⚠ possible | Multiple entries, RPC |
| **Delete time entry** | `TimeEntryList.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | Soft delete (approval_status='deleted') |
| **Close accounting period** | `AccountingPeriodsPage.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | RPC `close_accounting_period` |
| **Reopen accounting period** | `AccountingPeriodsPage.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | RPC `reopen_accounting_period` |
| **Delete project** | `ProjectsPage.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | Soft delete (status='cancelled') |
| **Delete project budget** | `BudgetVsActualPage.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | Direct delete |
| **Remove project member** | `ProjectMembersPage.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | RPC `remove_project_member` |
| **Acknowledge profitability alert** | `ProfitabilityAlertsPage.tsx` | ✗ no | ✓ yes | ✓ Toast | ✓ Toast | N/A | Sets acknowledged_by/acknowledged_at |
| **Delete profitability alert** | `ProfitabilityAlertsPage.tsx` | ✓ ConfirmDialog | ✓ yes | ✓ Toast | ✓ Toast | N/A | Direct delete |
| **Upload attachment** | `AttachmentsPanel.tsx` | ✗ no | ✓ yes | ✓ inline msg | ✓ inline msg | ✓ yes | Partial: file uploaded but metadata failed → cleanup attempted |
| **Create time entry (form)** | `TimeEntryForm.tsx` | ✗ no | ✓ yes | ✓ inline msg | ✓ inline msg | ✓ yes | Entry created, attachment upload may fail |

**Confirmation pattern**: All destructive actions use `ConfirmDialog` component (reusable modal). Non-destructive actions (acknowledge, upload) do not require confirmation.

**Feedback pattern**: All actions use `useToast()` hook for success/error messages. Some forms also show inline messages (TimeEntryForm, AttachmentsPanel).

**Partial failure**: Batch operations (batch approve, batch reject) can fail for individual entries. Attachment uploads can fail after entry creation. Both cases return explicit error messages and allow retry.

**P0 gaps**: None identified. All destructive actions have confirmation + feedback.

## Corrections Applied (2026-08-16)

### Provisioning Access Fix
- **Issue**: `service_role` lacked SELECT/INSERT/UPDATE/DELETE on `project_budgets` and `profitability_alerts`
- **Root Cause**: RLS policies required `auth.uid()` context; service_role had no table-level grants
- **Fix**: Migration `20240816080000_fix_provisioning_service_role_grants.sql` grants SELECT, INSERT, UPDATE, DELETE to service_role
- **Safety**: RLS policies remain in place; service_role access is safe and necessary for demo provisioning

### Accounting Period Close Fix
- **Issue**: Period 2024-08 remained `open` instead of being closed
- **Root Cause**: `close_accounting_period` RPC requires `auth.uid()` to be an authenticated admin; provisioning script used service_role
- **Fix**: Provisioning script now creates separate admin client, authenticates as admin@example.com, calls RPC with admin context
- **Idempotency**: Already-closed periods are handled gracefully (no error thrown)

### Quick Entry Business Date Fix
- **Issue**: `QuickEntryModal` used `new Date().toISOString().split('T')[0]` (UTC), not business timezone
- **Fix**: Changed to `todayStr()` from `temporalRules` module (America/Sao_Paulo)
- **Locations**: Initial state (line 38) and reset after save (line 138)

### Batch Partial Failure UX Fix
- **Issue**: Toast showed hardcoded count of approvable IDs, ignoring actual RPC success/failure breakdown
- **Fix**: Toast now uses actual results from RPC: "X approved; Y failed" when failures occur
- **Locations**: `TimeEntryApproval.tsx` confirmBatchApprove (lines 140-149) and confirmBatchReject (lines 160-171)
- **Toast type**: Changes to 'error' when failures > 0, 'success' otherwise
