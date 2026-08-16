-- ============================================================================
-- Fix: Project Health lifecycle blocker for completed/cancelled projects
-- Migration: 20240824050000
--
-- Root Cause:
--   calculate_project_health_internal() returns:
--     score  = NULL
--     status = 'not_applicable'
--   for projects whose status is 'completed' or 'cancelled'.
--
--   recalculate_project_health_internal() (called by the AFTER UPDATE
--   trigger trg_recalc_health_project whenever projects.status changes)
--   then tries to upsert that result into project_health_states, whose
--   columns were declared:
--     health_score  INTEGER NOT NULL CHECK (health_score >= 0 AND <= 100)
--     health_status TEXT    NOT NULL
--   and into project_health_events:
--     new_score INTEGER NOT NULL CHECK (new_score >= 0 AND <= 100)
--     new_status TEXT   NOT NULL
--
--   Inserting NULL into a NOT NULL column raises an exception inside the
--   trigger, which propagates up and rolls back the ENTIRE UPDATE
--   transaction. The net effect: admins CANNOT mark a project as completed
--   or cancelled (the operation appears to fail silently from the UI's
--   perspective because the row never actually changes).
--
--   The same defect affects recalculate_project_health() (public admin RPC)
--   and recalculate_all_project_health() (batch), which both delegate to
--   the same internal upsert.
--
-- Fix Strategy:
--   Allow health_score / new_score to be NULL, but ONLY when the
--   corresponding health_status / new_status is 'not_applicable'. This
--   preserves the invariant that real health states always carry a
--   concrete 0-100 score, while terminal projects correctly record
--   "not applicable" with no score.
--
--   Conceptual constraint (enforced via CHECK):
--     (status = 'not_applicable' AND score IS NULL)
--     OR
--     (status IN ('healthy','attention','at_risk') AND score BETWEEN 0 AND 100)
--
--   This is the minimal weakening required to fix the blocker. It does NOT
--   allow arbitrary NULL scores for active/planned projects.
--
--   No function bodies need to change: the functions already produce the
--   correct (NULL, 'not_applicable') pair for terminal projects; they only
--   failed because the schema rejected the NULL half of that pair.
--
--   The get_project_health() RPC and get_projects_health_summary() RPC
--   already handle NULL scores in their JSONB responses, so no RPC changes
--   are required either.
--
-- Idempotency:
--   All DROP/ADD CONSTRAINT statements use IF EXISTS / IF NOT EXISTS so the
--   migration is safe to re-run.
--
-- No SECURITY DEFINER bypass is introduced. No RLS policy is changed. No
-- trigger is recreated. The change is purely a schema constraint adjustment.
-- ============================================================================

-- ============================================================================
-- 1. project_health_states: allow NULL health_score for not_applicable
-- ============================================================================
ALTER TABLE public.project_health_states
  DROP CONSTRAINT IF EXISTS project_health_states_health_score_not_null;
ALTER TABLE public.project_health_states
  DROP CONSTRAINT IF EXISTS project_health_states_health_score_check;
ALTER TABLE public.project_health_states
  ALTER COLUMN health_score DROP NOT NULL;

-- Composite constraint: score is NULL iff status = not_applicable;
-- otherwise score must be a concrete 0-100 integer.
ALTER TABLE public.project_health_states
  ADD CONSTRAINT project_health_states_score_status_consistency CHECK (
    (health_status = 'not_applicable' AND health_score IS NULL)
    OR
    (health_status IN ('healthy', 'attention', 'at_risk') AND health_score IS NOT NULL
     AND health_score >= 0 AND health_score <= 100)
  );

-- ============================================================================
-- 2. project_health_events: allow NULL new_score (and previous_score already
--    nullable) for not_applicable transitions
-- ============================================================================
ALTER TABLE public.project_health_events
  DROP CONSTRAINT IF EXISTS project_health_events_new_score_not_null;
ALTER TABLE public.project_health_events
  DROP CONSTRAINT IF EXISTS project_health_events_new_score_check;
ALTER TABLE public.project_health_events
  ALTER COLUMN new_score DROP NOT NULL;

-- previous_score is already nullable, but it must follow the same
-- consistency rule when present.
ALTER TABLE public.project_health_events
  DROP CONSTRAINT IF EXISTS project_health_events_previous_score_check;
ALTER TABLE public.project_health_events
  ADD CONSTRAINT project_health_events_previous_score_check CHECK (
    previous_score IS NULL
    OR (previous_score >= 0 AND previous_score <= 100)
  );

-- Composite constraint on new_score / new_status (same invariant as states).
ALTER TABLE public.project_health_events
  ADD CONSTRAINT project_health_events_new_score_status_consistency CHECK (
    (new_status = 'not_applicable' AND new_score IS NULL)
    OR
    (new_status IN ('healthy', 'attention', 'at_risk') AND new_score IS NOT NULL
     AND new_score >= 0 AND new_score <= 100)
  );

-- ============================================================================
-- 3. Backfill safety: any pre-existing rows that violate the new invariant
--    would have been impossible to insert under the old NOT NULL constraint
--    for active/planned projects, and impossible to insert at all for
--    terminal projects (the bug). So no data migration is required. We do
--    NOT touch existing rows.
-- ============================================================================
