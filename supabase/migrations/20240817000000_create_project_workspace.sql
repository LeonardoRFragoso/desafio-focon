-- ============================================================================
-- Project Workspace: phases, tasks, members, and time-entry linking
--
-- This migration introduces the Project → Phase → Task → TimeEntry hierarchy
-- and a project_members table for per-project role assignment.
--
-- All new tables have RLS enabled with admin-manage / authenticated-read
-- policies, following the existing pattern in finalize_rls_security.sql.
-- ============================================================================

-- ============================================================================
-- 1. project_phases
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(trim(name)) >= 1 AND length(name) <= 200),
  description     TEXT CHECK (length(description) <= 2000),
  status          TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  position        INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  planned_minutes INTEGER CHECK (planned_minutes IS NULL OR (planned_minutes > 0 AND planned_minutes <= 525600)),
  planned_cost    NUMERIC(14,2) CHECK (planned_cost IS NULL OR planned_cost >= 0),
  start_date      DATE,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phases_project ON public.project_phases (project_id, position);
CREATE INDEX IF NOT EXISTS idx_phases_status ON public.project_phases (status);

ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. project_tasks
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id        UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  title           TEXT NOT NULL CHECK (length(trim(title)) >= 1 AND length(title) <= 300),
  description     TEXT CHECK (length(description) <= 5000),
  status          TEXT NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  planned_minutes INTEGER CHECK (planned_minutes IS NULL OR (planned_minutes > 0 AND planned_minutes <= 525600)),
  start_date      DATE,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.project_tasks (project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_phase ON public.project_tasks (phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.project_tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.project_tasks (due_date) WHERE due_date IS NOT NULL;

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. project_members
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_role    TEXT NOT NULL DEFAULT 'professional'
                  CHECK (project_role IN ('manager', 'technical_lead', 'professional', 'observer')),
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_members_project ON public.project_members (project_id);
CREATE INDEX IF NOT EXISTS idx_members_professional ON public.project_members (professional_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. time_entries: add phase_id and task_id (nullable, backward compatible)
-- ============================================================================
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_task ON public.time_entries (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_phase ON public.time_entries (phase_id) WHERE phase_id IS NOT NULL;

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

-- Helper functions to check project membership without RLS recursion.
-- These are SECURITY DEFINER so they bypass RLS on project_members,
-- avoiding the infinite recursion that would occur if the policies
-- on project_members referenced project_members in a subquery.
CREATE OR REPLACE FUNCTION public.is_project_manager(p_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND professional_id = p_user_id
      AND project_role = 'manager'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_lead(p_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND professional_id = p_user_id
      AND project_role IN ('manager', 'technical_lead')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_project_manager(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_project_lead(UUID, UUID) FROM anon;

-- ---- project_phases ----
DROP POLICY IF EXISTS "phases_select_authenticated" ON public.project_phases;
CREATE POLICY "phases_select_authenticated"
  ON public.project_phases FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "phases_admin_all" ON public.project_phases;
CREATE POLICY "phases_admin_all"
  ON public.project_phases FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Project managers/leads can manage phases for their projects
DROP POLICY IF EXISTS "phases_manager_all" ON public.project_phases;
CREATE POLICY "phases_manager_all"
  ON public.project_phases FOR ALL
  TO authenticated
  USING (public.is_project_lead(auth.uid(), project_phases.project_id))
  WITH CHECK (public.is_project_lead(auth.uid(), project_phases.project_id));

-- ---- project_tasks ----
DROP POLICY IF EXISTS "tasks_select_authenticated" ON public.project_tasks;
CREATE POLICY "tasks_select_authenticated"
  ON public.project_tasks FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tasks_admin_all" ON public.project_tasks;
CREATE POLICY "tasks_admin_all"
  ON public.project_tasks FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Project managers / technical leads can manage tasks
DROP POLICY IF EXISTS "tasks_manager_all" ON public.project_tasks;
CREATE POLICY "tasks_manager_all"
  ON public.project_tasks FOR ALL
  TO authenticated
  USING (public.is_project_lead(auth.uid(), project_tasks.project_id))
  WITH CHECK (public.is_project_lead(auth.uid(), project_tasks.project_id));

-- Assignees can update their own tasks (status, priority, etc.)
DROP POLICY IF EXISTS "tasks_assignee_update" ON public.project_tasks;
CREATE POLICY "tasks_assignee_update"
  ON public.project_tasks FOR UPDATE
  TO authenticated
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

-- ---- project_members ----
DROP POLICY IF EXISTS "members_select_authenticated" ON public.project_members;
CREATE POLICY "members_select_authenticated"
  ON public.project_members FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "members_admin_all" ON public.project_members;
CREATE POLICY "members_admin_all"
  ON public.project_members FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Project managers can manage members of their projects
-- Uses is_project_manager (SECURITY DEFINER) to avoid RLS recursion
DROP POLICY IF EXISTS "members_manager_all" ON public.project_members;
CREATE POLICY "members_manager_all"
  ON public.project_members FOR ALL
  TO authenticated
  USING (public.is_project_manager(auth.uid(), project_members.project_id))
  WITH CHECK (public.is_project_manager(auth.uid(), project_members.project_id));

-- ============================================================================
-- 6. Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.project_phases,
  public.project_tasks,
  public.project_members
TO authenticated;

GRANT ALL PRIVILEGES ON
  public.project_phases,
  public.project_tasks,
  public.project_members
TO service_role;

-- ============================================================================
-- 7. updated_at triggers (reuse existing touch_updated_at function)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_touch_phases ON public.project_phases;
CREATE TRIGGER trg_touch_phases
  BEFORE UPDATE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_tasks ON public.project_tasks;
CREATE TRIGGER trg_touch_tasks
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_members ON public.project_members;
CREATE TRIGGER trg_touch_members
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 8. RPC: get_project_workspace_summary
-- Returns aggregated workspace metrics for a project (admin only).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_project_workspace_summary(p_project_id UUID)
RETURNS TABLE (
  total_phases INTEGER,
  active_phases INTEGER,
  completed_phases INTEGER,
  total_tasks INTEGER,
  open_tasks INTEGER,
  done_tasks INTEGER,
  overdue_tasks INTEGER,
  team_size INTEGER,
  planned_minutes BIGINT,
  logged_minutes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_phases INTEGER := 0;
  v_active_phases INTEGER := 0;
  v_completed_phases INTEGER := 0;
  v_total_tasks INTEGER := 0;
  v_open_tasks INTEGER := 0;
  v_done_tasks INTEGER := 0;
  v_overdue_tasks INTEGER := 0;
  v_team_size INTEGER := 0;
  v_planned_minutes BIGINT := 0;
  v_logged_minutes BIGINT := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (WHERE status = 'active')::INTEGER,
    count(*) FILTER (WHERE status = 'completed')::INTEGER
  INTO
    v_total_phases, v_active_phases, v_completed_phases
  FROM project_phases WHERE project_id = p_project_id;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (WHERE status NOT IN ('done', 'cancelled'))::INTEGER,
    count(*) FILTER (WHERE status = 'done')::INTEGER,
    count(*) FILTER (WHERE status NOT IN ('done', 'cancelled') AND due_date IS NOT NULL AND due_date < CURRENT_DATE)::INTEGER
  INTO
    v_total_tasks, v_open_tasks, v_done_tasks, v_overdue_tasks
  FROM project_tasks WHERE project_id = p_project_id;

  SELECT count(DISTINCT professional_id)::INTEGER
  INTO v_team_size
  FROM project_members WHERE project_id = p_project_id;

  SELECT COALESCE(SUM(pt.planned_minutes), 0)::BIGINT
  INTO v_planned_minutes
  FROM project_tasks pt WHERE pt.project_id = p_project_id AND pt.planned_minutes IS NOT NULL;

  SELECT COALESCE(SUM(te.duration_minutes), 0)::BIGINT
  INTO v_logged_minutes
  FROM time_entries te
  WHERE te.project_id = p_project_id AND te.approval_status = 'approved';

  total_phases := v_total_phases;
  active_phases := v_active_phases;
  completed_phases := v_completed_phases;
  total_tasks := v_total_tasks;
  open_tasks := v_open_tasks;
  done_tasks := v_done_tasks;
  overdue_tasks := v_overdue_tasks;
  team_size := v_team_size;
  planned_minutes := v_planned_minutes;
  logged_minutes := v_logged_minutes;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_workspace_summary(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_project_workspace_summary(UUID) FROM anon;
