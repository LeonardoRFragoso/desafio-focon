-- ===========================================================================
-- Phase 6: Project Milestones, Project Health & Forecasting
--
-- This migration introduces:
--   1. project_milestones — formal deliverables with status, priority, owner,
--      dates, progress, weight, and position.
--   2. project_tasks.milestone_id — optional link from task to milestone.
--   3. project_health_states — persisted canonical health state per project.
--   4. project_health_events — append-only history of health status transitions.
--
-- RLS follows the existing pattern:
--   * Admin: full CRUD on all new tables.
--   * Project manager / technical lead: CRUD on milestones for authorized
--     projects (reuses is_project_lead helper).
--   * Professional / observer: SELECT milestones for permitted projects.
--   * Health states/events: admin-only writes; authenticated read for
--     non-financial fields (sanitized view provided via RPC).
--
-- All new tables use the existing touch_updated_at() trigger pattern.
-- ===========================================================================

-- ============================================================================
-- 1. project_milestones
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(trim(name)) >= 1 AND length(name) <= 300),
  description     TEXT CHECK (description IS NULL OR length(description) <= 5000),
  status          TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  owner_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_date      DATE,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0
                  CHECK (progress_percent >= 0 AND progress_percent <= 100),
  weight          NUMERIC(10,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0),
  position        INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_milestone_dates CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  CONSTRAINT valid_milestone_completion CHECK (
    (status = 'completed' AND progress_percent = 100 AND completed_at IS NOT NULL)
    OR (status != 'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_milestones_project_status
  ON public.project_milestones (project_id, status);
CREATE INDEX IF NOT EXISTS idx_milestones_project_due
  ON public.project_milestones (project_id, due_date)
  WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_milestones_owner_status
  ON public.project_milestones (owner_id, status)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_milestones_due_date
  ON public.project_milestones (due_date)
  WHERE due_date IS NOT NULL AND status NOT IN ('completed', 'cancelled');

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read milestones (same as phases/tasks)
DROP POLICY IF EXISTS "milestones_select_authenticated" ON public.project_milestones;
CREATE POLICY "milestones_select_authenticated"
  ON public.project_milestones FOR SELECT
  TO authenticated
  USING (true);

-- Admin: full access
DROP POLICY IF EXISTS "milestones_admin_all" ON public.project_milestones;
CREATE POLICY "milestones_admin_all"
  ON public.project_milestones FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Project managers / technical leads can manage milestones for their projects
DROP POLICY IF EXISTS "milestones_lead_all" ON public.project_milestones;
CREATE POLICY "milestones_lead_all"
  ON public.project_milestones FOR ALL
  TO authenticated
  USING (public.is_project_lead(auth.uid(), project_milestones.project_id))
  WITH CHECK (public.is_project_lead(auth.uid(), project_milestones.project_id));

-- ============================================================================
-- 2. project_tasks: add milestone_id (nullable, backward compatible)
-- ============================================================================
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_milestone
  ON public.project_tasks (milestone_id)
  WHERE milestone_id IS NOT NULL;

-- ============================================================================
-- 3. project_health_states (one row per project, upserted on recalculation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_health_states (
  project_id              UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  health_score            INTEGER NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  health_status           TEXT NOT NULL CHECK (health_status IN ('healthy', 'attention', 'at_risk', 'not_applicable')),
  progress_percent        NUMERIC(5,2),
  budget_utilization      NUMERIC(7,2),
  forecast_completion_date DATE,
  forecast_labor_cost     NUMERIC(15,2),
  drivers                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_states_status
  ON public.project_health_states (health_status);

ALTER TABLE public.project_health_states ENABLE ROW LEVEL SECURITY;

-- Admin: full access (read financial drivers)
DROP POLICY IF EXISTS "health_states_admin_all" ON public.project_health_states;
CREATE POLICY "health_states_admin_all"
  ON public.project_health_states FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Non-admins: SELECT only (sanitized — RPC strips financial data)
DROP POLICY IF EXISTS "health_states_select_authenticated" ON public.project_health_states;
CREATE POLICY "health_states_select_authenticated"
  ON public.project_health_states FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 4. project_health_events (append-only transition history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_health_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('healthy', 'attention', 'at_risk', 'not_applicable')),
  new_status      TEXT NOT NULL CHECK (new_status IN ('healthy', 'attention', 'at_risk', 'not_applicable')),
  previous_score  INTEGER,
  new_score       INTEGER NOT NULL CHECK (new_score >= 0 AND new_score <= 100),
  drivers         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_events_project_created
  ON public.project_health_events (project_id, created_at DESC);

ALTER TABLE public.project_health_events ENABLE ROW LEVEL SECURITY;

-- Admin: full read
DROP POLICY IF EXISTS "health_events_admin_all" ON public.project_health_events;
CREATE POLICY "health_events_admin_all"
  ON public.project_health_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Non-admins: SELECT only (for project members to see transitions)
DROP POLICY IF EXISTS "health_events_select_authenticated" ON public.project_health_events;
CREATE POLICY "health_events_select_authenticated"
  ON public.project_health_events FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE for authenticated — only service_role / SECURITY DEFINER
-- functions write to this table.
REVOKE ALL PRIVILEGES ON TABLE public.project_health_events FROM anon;
GRANT SELECT ON TABLE public.project_health_events TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.project_health_events TO service_role;

-- ============================================================================
-- 5. Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated;
GRANT ALL PRIVILEGES ON public.project_milestones TO service_role;

GRANT SELECT, UPDATE ON public.project_health_states TO authenticated;
GRANT ALL PRIVILEGES ON public.project_health_states TO service_role;

-- ============================================================================
-- 6. updated_at triggers
-- ============================================================================
DROP TRIGGER IF EXISTS trg_touch_milestones ON public.project_milestones;
CREATE TRIGGER trg_touch_milestones
  BEFORE UPDATE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 7. Trigger: auto-set completed_at and progress when status → completed
--    and clear completed_at when reopened.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.milestone_status_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    NEW.progress_percent := 100;
  ELSIF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    -- Reopening: clear completed_at
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_milestone_status_consistency ON public.project_milestones;
CREATE TRIGGER trg_milestone_status_consistency
  BEFORE INSERT OR UPDATE OF status ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.milestone_status_consistency();

-- ============================================================================
-- 8. Add 'project_health_changed' to notifications type CHECK constraint
-- ============================================================================
-- The notifications table has a CHECK constraint on type. We need to alter it
-- to include the new notification type.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'entry_approved', 'entry_rejected', 'entry_submitted',
    'entry_pending_reminder', 'period_closing', 'budget_threshold',
    'comment_received', 'project_health_changed', 'system'
  ));
