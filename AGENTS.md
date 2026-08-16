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
