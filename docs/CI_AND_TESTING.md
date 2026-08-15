# CI and Testing

This document describes the CI pipeline, local testing commands, and the
gates that must pass before any pull request can be merged into `main`.

## Local Frontend

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

| Command | Description |
|---|---|
| `npm ci` | Clean install from lockfile |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run test` | Vitest test suite (`vitest run`, not watch mode) |
| `npm run build` | Production build (`tsc -b && vite build`) |

All five must pass locally before pushing.

## Local Database

The project uses Supabase with a local development stack. Database tests are
PL/pgSQL assertion-based suites in `supabase/tests/` that raise exceptions on
failure.

```bash
# Start the local Supabase stack
supabase start

# Reset the database (applies all migrations + seed data)
supabase db reset

# Verify migrations are applied
supabase migration list --local

# Run the database/RLS test suites
bash scripts/test-database.sh
```

### Why not `supabase test db`?

`supabase test db` wraps `pg_prove` (the pgTAP test runner) and expects TAP
output. The FoconFlow test files use PL/pgSQL assertions (`RAISE EXCEPTION`
on failure) rather than pgTAP's `ok()`/`is()` functions, so `pg_prove`
reports a false "FAIL: No plan found in TAP output" even when all assertions
pass.

`scripts/test-database.sh` runs each `.sql` file in `supabase/tests/`
directly via `psql` with `ON_ERROR_STOP=1`, which correctly propagates the
real exit code: 0 only when every assertion passes, non-zero on the first
failure.

### Test files

| File | Coverage |
|---|---|
| `supabase/tests/time_entries_crud.sql` | Time entry CRUD boundaries, approval/rejection, rejection reasons, approval history, audit logs, batch approval, closed-period protection (28 assertions) |
| `supabase/tests/rls_policies.sql` | RLS policies for profiles, projects, project_financials, hourly_rates, comments, attachments, user_preferences, project_budgets, profitability_alerts, audit_logs, notifications (35 assertions) |

### Negative failure proof

The runner was validated by temporarily inserting a false assertion
(`assert_true(FALSE, ...)`) and confirming exit code 1. The false assertion
was reverted before commit.

## CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every push to `main`
and `feat/**` branches, and on every pull request targeting `main`.

### Frontend job

| Step | Command |
|---|---|
| Install dependencies | `npm ci` |
| Run linter | `npm run lint` |
| Run type check | `npm run typecheck` |
| Run frontend tests | `npm run test` |
| Build | `npm run build` |
| Audit (high severity only) | `npm audit --audit-level=high` |

The test step (`npm run test`) is mandatory — CI is **not** green unless the
Vitest suite passes. The audit step only fails on `high` or `critical`
vulnerabilities; the two pre-existing `moderate` vulnerabilities in the
`exceljs`/`uuid` dependency chain do not block CI.

### Database job

| Step | Command |
|---|---|
| Clean up previous Supabase | `supabase stop --no-backup \|\| true` |
| Start Supabase | `supabase start` |
| Verify status | `supabase status` |
| Reset database | `supabase db reset` |
| Verify migrations | `supabase migration list --local` |
| Run database/RLS tests | `bash scripts/test-database.sh` |
| Stop Supabase | `supabase stop --no-backup \|\| true` (always) |

The "Run database/RLS tests" step is mandatory — CI is **not** green unless
all SQL/RLS assertions pass.

### Workflow hardening

- **Permissions**: `contents: read` only (least privilege).
- **Concurrency**: obsolete runs on PR/feature branches are cancelled;
  `main` pushes are never cancelled.
- **Timeout**: 15 minutes per job to prevent stuck runners.
- **No `continue-on-error`**: all gate steps must genuinely pass.
- **No exit-code masking**: no `|| true` on test/lint/build commands.

## Failure behavior

If any step fails, the job fails, the CI check turns red, and the PR cannot
be merged (once branch protection is configured). There is no
`continue-on-error`, no warning-only mode, and no way to swallow a test
failure.

## Required checks

The following GitHub status checks are required for merge into `main`:

- `frontend (24.x)` — the frontend job
- `database` — the database job

These names come from the job definitions in `ci.yml` and must match exactly
when configuring branch protection.
