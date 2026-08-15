-- ============================================================================
-- Phase 6 Hardening Migration
--
-- Addresses:
--   Phase 2:  RLS on project_health_states/events (admin-only raw access)
--   Phase 3:  Project membership checks in sanitized RPCs
--   Phase 4:  Milestone RLS (role-aware visibility)
--   Phase 5:  Cross-project capacity driver fix
--   Phase 6:  Automatic health recalculation triggers
--   Phase 7:  Transition event + notification dedup (already partially done)
--   Phase 8:  Health initialization/backfill
--   Phase 11: Summary accuracy (not_applicable vs missing)
--   Phase 12: Global search milestone isolation
-- ============================================================================

-- ============================================================================
-- 1. Helper: is_project_member(user_id, project_id)
--    Returns true if user is admin, project manager/lead, or a member of
--    the project. Reuses canonical project_members table.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_project_member(p_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin(p_user_id)
  OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND professional_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_project_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_member(UUID, UUID) TO authenticated;

-- ============================================================================
-- 2. RLS: project_health_states — admin-only raw access
--    Non-admins CANNOT read the raw table. They must use get_project_health().
-- ============================================================================
DROP POLICY IF EXISTS "health_states_select_authenticated" ON public.project_health_states;
DROP POLICY IF EXISTS "health_states_admin_all" ON public.project_health_states;

-- Admin: full CRUD on raw table
CREATE POLICY "health_states_admin_all"
  ON public.project_health_states FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- No SELECT policy for non-admins → RLS denies all rows.
-- Service_role bypasses RLS so internal functions can still write.

-- ============================================================================
-- 3. RLS: project_health_events — admin-only raw access
--    Non-admins CANNOT read the raw table. They must use get_project_health_history().
-- ============================================================================
DROP POLICY IF EXISTS "health_events_select_authenticated" ON public.project_health_events;
DROP POLICY IF EXISTS "health_events_admin_all" ON public.project_health_events;

-- Admin: full CRUD on raw table
CREATE POLICY "health_events_admin_all"
  ON public.project_health_events FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- No SELECT policy for non-admins → RLS denies all rows.

-- ============================================================================
-- 4. RLS: project_milestones — role-aware visibility
--    Admin: all. Manager/lead: their projects. Member: their projects.
--    Non-member: denied.
-- ============================================================================
DROP POLICY IF EXISTS "milestones_select_authenticated" ON public.project_milestones;
DROP POLICY IF EXISTS "milestones_admin_all" ON public.project_milestones;
DROP POLICY IF EXISTS "milestones_lead_all" ON public.project_milestones;

-- SELECT: admin, manager/lead, or project member
CREATE POLICY "milestones_select_authorized"
  ON public.project_milestones FOR SELECT
  TO authenticated
  USING (public.is_project_member(auth.uid(), project_milestones.project_id));

-- Admin: full CRUD
CREATE POLICY "milestones_admin_all"
  ON public.project_milestones FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Manager/technical lead: CRUD for their projects
CREATE POLICY "milestones_lead_all"
  ON public.project_milestones FOR ALL
  TO authenticated
  USING (public.is_project_lead(auth.uid(), project_milestones.project_id))
  WITH CHECK (public.is_project_lead(auth.uid(), project_milestones.project_id));

-- ============================================================================
-- 5. Update get_project_health — add project membership check
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_project_health(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_state public.project_health_states%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_drivers JSONB;
  v_sanitized_drivers JSONB;
BEGIN
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;

  SELECT * INTO v_state FROM public.project_health_states WHERE project_id = p_project_id;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

  -- Membership check: non-admins can only access projects they belong to
  IF NOT v_is_admin AND NOT public.is_project_member(auth.uid(), p_project_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this project';
  END IF;

  -- If no state exists yet, return null (distinguish from not_applicable)
  IF v_state.project_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', NULL,
      'status', NULL,
      'progress', public.get_project_progress(p_project_id),
      'budget_utilization', NULL,
      'forecast_completion_date', NULL,
      'forecast_labor_cost', NULL,
      'drivers', NULL,
      'calculated_at', NULL
    );
  END IF;

  IF v_is_admin THEN
    -- Full response
    RETURN jsonb_build_object(
      'score', v_state.health_score,
      'status', v_state.health_status,
      'progress', v_state.progress_percent,
      'budget_utilization', v_state.budget_utilization,
      'forecast_completion_date', v_state.forecast_completion_date,
      'forecast_labor_cost', v_state.forecast_labor_cost,
      'drivers', v_state.drivers,
      'calculated_at', v_state.calculated_at
    );
  ELSE
    -- Sanitized: strip financial data
    v_drivers := v_state.drivers;
    v_sanitized_drivers := jsonb_build_object(
      'schedule', v_drivers->'schedule',
      'critical_delivery', v_drivers->'critical_delivery',
      'hard_override', v_drivers->'hard_override'
    );
    RETURN jsonb_build_object(
      'score', v_state.health_score,
      'status', v_state.health_status,
      'progress', v_state.progress_percent,
      'budget_utilization', NULL,
      'forecast_completion_date', NULL,
      'forecast_labor_cost', NULL,
      'drivers', v_sanitized_drivers,
      'calculated_at', v_state.calculated_at
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_project_health(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_health(UUID) TO authenticated;

-- ============================================================================
-- 6. Update get_project_health_history — add project membership check
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_project_health_history(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;

  -- Membership check: non-admins can only access projects they belong to
  IF NOT v_is_admin AND NOT public.is_project_member(auth.uid(), p_project_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this project';
  END IF;

  IF v_is_admin THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_result
    FROM (
      SELECT id, project_id, previous_status, new_status, previous_score, new_score, drivers, created_at
      FROM public.project_health_events
      WHERE project_id = p_project_id
    ) t;
  ELSE
    -- Sanitized: strip financial drivers
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'project_id', t.project_id,
      'previous_status', t.previous_status,
      'new_status', t.new_status,
      'previous_score', t.previous_score,
      'new_score', t.new_score,
      'drivers', jsonb_build_object(
        'schedule', t.drivers->'schedule',
        'critical_delivery', t.drivers->'critical_delivery',
        'hard_override', t.drivers->'hard_override'
      ),
      'created_at', t.created_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_result
    FROM (
      SELECT id, project_id, previous_status, new_status, previous_score, new_score, drivers, created_at
      FROM public.project_health_events
      WHERE project_id = p_project_id
    ) t;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_project_health_history(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_health_history(UUID) TO authenticated;

-- ============================================================================
-- 7. Update get_projects_health_summary — distinguish missing vs not_applicable
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_projects_health_summary(
  p_status_filter TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY
    CASE t.health_status WHEN 'at_risk' THEN 0 WHEN 'attention' THEN 1 WHEN 'healthy' THEN 2 ELSE 3 END,
    t.name
  ), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      p.id,
      p.name,
      p.client,
      p.status AS project_status,
      p.start_date,
      p.end_date,
      phs.health_score,
      -- Distinguish: NULL when no state exists (missing), 'not_applicable' only
      -- for completed/cancelled projects
      CASE
        WHEN phs.project_id IS NULL THEN NULL
        ELSE phs.health_status
      END AS health_status,
      COALESCE(phs.progress_percent, public.get_project_progress(p.id)) AS progress_percent,
      phs.budget_utilization,
      phs.forecast_completion_date,
      phs.forecast_labor_cost,
      phs.calculated_at,
      -- Flag: has canonical state been calculated?
      (phs.project_id IS NOT NULL) AS has_calculated_state,
      -- Overdue milestones count
      COALESCE((
        SELECT COUNT(*) FROM public.project_milestones pm
        WHERE pm.project_id = p.id
          AND pm.due_date IS NOT NULL
          AND pm.due_date < CURRENT_DATE
          AND pm.status NOT IN ('completed', 'cancelled')
      ), 0) AS overdue_milestones_count,
      -- Overdue tasks count
      COALESCE((
        SELECT COUNT(*) FROM public.project_tasks pt
        WHERE pt.project_id = p.id
          AND pt.due_date IS NOT NULL
          AND pt.due_date < CURRENT_DATE
          AND pt.status NOT IN ('done', 'cancelled')
      ), 0) AS overdue_tasks_count,
      -- Total milestones
      COALESCE((
        SELECT COUNT(*) FROM public.project_milestones pm
        WHERE pm.project_id = p.id AND pm.status != 'cancelled'
      ), 0) AS total_milestones
    FROM public.projects p
    LEFT JOIN public.project_health_states phs ON phs.project_id = p.id
    WHERE p.status IN ('active', 'planned')
      AND (
        p_status_filter IS NULL
        OR COALESCE(phs.health_status, NULL) = p_status_filter
        OR (p_status_filter = 'not_calculated' AND phs.project_id IS NULL)
      )
  ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_projects_health_summary(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_projects_health_summary(TEXT) TO authenticated;

-- ============================================================================
-- 8. Fix capacity driver in calculate_project_health — cross-project
--    Instead of only looking at project P's allocations, compute TOTAL
--    allocation across ALL projects for each professional relevant to P.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_project_health_internal(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_progress NUMERIC;
  v_score INTEGER;
  v_status TEXT;

  -- Schedule
  v_overdue_end_penalty INTEGER := 0;
  v_overdue_milestones_count INTEGER := 0;
  v_milestone_schedule_penalty INTEGER := 0;
  v_overdue_tasks_count INTEGER := 0;
  v_task_schedule_penalty INTEGER := 0;
  v_schedule_penalty INTEGER := 0;

  -- Budget
  v_budget_value NUMERIC := 0;
  v_realized_labor NUMERIC := 0;
  v_has_budget BOOLEAN := false;
  v_budget_utilization NUMERIC := 0;
  v_budget_penalty INTEGER := 0;

  -- Profitability
  v_active_alerts_count INTEGER := 0;
  v_profitability_penalty INTEGER := 0;

  -- Capacity (cross-project)
  v_overallocated_members INTEGER := 0;
  v_max_utilization NUMERIC := 0;
  v_capacity_available BOOLEAN := false;
  v_capacity_penalty INTEGER := 0;

  -- Critical delivery
  v_critical_milestones_blocked INTEGER := 0;
  v_critical_milestones_overdue INTEGER := 0;
  v_critical_milestones_due_soon INTEGER := 0;
  v_critical_tasks_blocked INTEGER := 0;
  v_critical_tasks_overdue INTEGER := 0;
  v_critical_tasks_due_soon INTEGER := 0;
  v_critical_delivery_penalty INTEGER := 0;

  -- Hard overrides
  v_hard_override TEXT := NULL;
  v_critical_milestone_overdue_7d INTEGER := 0;

  -- Forecast
  v_elapsed_days INTEGER;
  v_velocity NUMERIC;
  v_remaining NUMERIC;
  v_forecast_days NUMERIC;
  v_forecast_completion_date DATE := NULL;
  v_approved_labor_cost NUMERIC := 0;
  v_forecast_labor_cost NUMERIC := NULL;

  -- Drivers
  v_drivers JSONB;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

  -- Completed/cancelled projects are not_applicable
  IF v_project.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'score', NULL,
      'status', 'not_applicable',
      'progress', NULL,
      'budget_utilization', NULL,
      'forecast_completion_date', NULL,
      'forecast_labor_cost', NULL,
      'drivers', jsonb_build_object('hard_override', 'project_not_active')
    );
  END IF;

  -- Progress
  v_progress := public.get_project_progress(p_project_id);

  -- ================================================================
  -- A. SCHEDULE (max 30)
  -- ================================================================
  IF v_project.end_date IS NOT NULL AND v_project.end_date < CURRENT_DATE
     AND v_project.status = 'active' THEN
    v_overdue_end_penalty := 15;
  END IF;

  SELECT COUNT(*) INTO v_overdue_milestones_count
  FROM public.project_milestones
  WHERE project_id = p_project_id
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE
    AND status NOT IN ('completed', 'cancelled');

  v_milestone_schedule_penalty := CASE
    WHEN v_overdue_milestones_count >= 5 THEN 10
    WHEN v_overdue_milestones_count = 4 THEN 9
    WHEN v_overdue_milestones_count = 3 THEN 7
    WHEN v_overdue_milestones_count = 2 THEN 5
    WHEN v_overdue_milestones_count = 1 THEN 3
    ELSE 0
  END;

  SELECT COUNT(*) INTO v_overdue_tasks_count
  FROM public.project_tasks
  WHERE project_id = p_project_id
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE
    AND status NOT IN ('done', 'cancelled');

  v_task_schedule_penalty := CASE
    WHEN v_overdue_tasks_count >= 7 THEN 5
    WHEN v_overdue_tasks_count >= 4 THEN 4
    WHEN v_overdue_tasks_count >= 2 THEN 3
    WHEN v_overdue_tasks_count = 1 THEN 2
    ELSE 0
  END;

  v_schedule_penalty := LEAST(v_overdue_end_penalty + v_milestone_schedule_penalty + v_task_schedule_penalty, 30);

  -- ================================================================
  -- B. BUDGET (max 30)
  -- ================================================================
  SELECT COALESCE(pb.budget_value, 0)
  INTO v_budget_value
  FROM public.project_budgets pb
  WHERE pb.project_id = p_project_id
    AND pb.budget_type = 'labor_cost'
  ORDER BY pb.fiscal_year DESC
  LIMIT 1;

  v_realized_labor := public.get_project_realized_labor_cost(p_project_id, NULL, NULL);

  IF v_budget_value > 0 THEN
    v_has_budget := true;
    v_budget_utilization := ROUND((v_realized_labor / v_budget_value) * 100, 2);
  ELSE
    v_budget_utilization := NULL;
  END IF;

  IF v_has_budget THEN
    v_budget_penalty := CASE
      WHEN v_budget_utilization >= 100 THEN 30
      WHEN v_budget_utilization >= 90 THEN 20
      WHEN v_budget_utilization >= 80 THEN 10
      ELSE 0
    END;
  END IF;

  -- ================================================================
  -- C. PROFITABILITY (max 15)
  -- ================================================================
  SELECT COUNT(*) INTO v_active_alerts_count
  FROM public.profitability_alerts
  WHERE project_id = p_project_id
    AND acknowledged_by IS NULL;

  v_profitability_penalty := LEAST(v_active_alerts_count * 5, 15);

  -- ================================================================
  -- D. CAPACITY (max 10) — CROSS-PROJECT FIX
  --    For each professional in project P, compute their TOTAL allocation
  --    across ALL projects for the current week. This detects
  --    overallocation that spans multiple projects.
  -- ================================================================
  -- Step 1: Get professionals relevant to project P
  -- Step 2: For each, sum allocations across ALL projects (prorated)
  -- Step 3: Compare against their weekly capacity
  WITH relevant_professionals AS (
    SELECT DISTINCT professional_id
    FROM public.project_allocations pa
    WHERE pa.project_id = p_project_id
      AND pa.start_date <= (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE
      AND pa.end_date >= date_trunc('week', CURRENT_DATE)::DATE
  ),
  -- Total allocation across ALL projects for each relevant professional
  total_alloc AS (
    SELECT
      rp.professional_id,
      SUM(
        (LEAST(pa.end_date, (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE)
         - GREATEST(pa.start_date, date_trunc('week', CURRENT_DATE)::DATE) + 1)::NUMERIC
        / NULLIF(GREATEST(pa.end_date - pa.start_date + 1, 1), 0)
        * pa.allocated_minutes
      ) AS total_allocated_minutes
    FROM relevant_professionals rp
    JOIN public.project_allocations pa ON pa.professional_id = rp.professional_id
    WHERE pa.start_date <= (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE
      AND pa.end_date >= date_trunc('week', CURRENT_DATE)::DATE
    GROUP BY rp.professional_id
  ),
  -- Join with capacity rules
  prof_cap AS (
    SELECT
      ta.professional_id,
      ta.total_allocated_minutes,
      cr.weekly_capacity_minutes
    FROM total_alloc ta
    LEFT JOIN LATERAL (
      SELECT cr2.weekly_capacity_minutes
      FROM public.professional_capacity_rules cr2
      WHERE cr2.professional_id = ta.professional_id
        AND cr2.valid_from <= date_trunc('week', CURRENT_DATE)::DATE
        AND (cr2.valid_until IS NULL OR cr2.valid_until >= date_trunc('week', CURRENT_DATE)::DATE)
      ORDER BY cr2.valid_from DESC
      LIMIT 1
    ) cr ON true
  )
  SELECT
    COUNT(*) FILTER (WHERE weekly_capacity_minutes IS NOT NULL AND total_allocated_minutes > weekly_capacity_minutes),
    COALESCE(MAX(
      CASE WHEN weekly_capacity_minutes IS NOT NULL AND weekly_capacity_minutes > 0
           THEN (total_allocated_minutes::NUMERIC / weekly_capacity_minutes) * 100
           ELSE NULL END
    ), 0)
  INTO v_overallocated_members, v_max_utilization
  FROM prof_cap;

  v_capacity_available := EXISTS (
    SELECT 1 FROM public.professional_capacity_rules cr
    JOIN public.project_members pm ON pm.professional_id = cr.professional_id
    WHERE pm.project_id = p_project_id
      AND cr.valid_from <= CURRENT_DATE
      AND (cr.valid_until IS NULL OR cr.valid_until >= CURRENT_DATE)
  );

  IF v_capacity_available AND v_overallocated_members > 0 THEN
    IF v_max_utilization > 110 THEN
      v_capacity_penalty := 10;
    ELSIF v_max_utilization > 100 THEN
      v_capacity_penalty := 7;
    END IF;
  END IF;

  -- ================================================================
  -- E. CRITICAL DELIVERY (max 15)
  -- ================================================================
  SELECT
    COUNT(*) FILTER (WHERE status = 'blocked'),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days')
  INTO v_critical_milestones_blocked, v_critical_milestones_overdue, v_critical_milestones_due_soon
  FROM public.project_milestones
  WHERE project_id = p_project_id
    AND priority = 'critical'
    AND status NOT IN ('completed', 'cancelled');

  SELECT
    COUNT(*) FILTER (WHERE status = 'blocked'),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days')
  INTO v_critical_tasks_blocked, v_critical_tasks_overdue, v_critical_tasks_due_soon
  FROM public.project_tasks
  WHERE project_id = p_project_id
    AND priority = 'critical'
    AND status NOT IN ('done', 'cancelled');

  v_critical_delivery_penalty := LEAST(
    (v_critical_milestones_blocked + v_critical_milestones_overdue + v_critical_milestones_due_soon
     + v_critical_tasks_blocked + v_critical_tasks_overdue + v_critical_tasks_due_soon) * 5,
    15
  );

  -- ================================================================
  -- SCORE
  -- ================================================================
  v_score := 100 - v_schedule_penalty - v_budget_penalty - v_profitability_penalty - v_capacity_penalty - v_critical_delivery_penalty;
  v_score := GREATEST(LEAST(v_score, 100), 0);

  -- ================================================================
  -- HARD OVERRIDES → at_risk
  -- ================================================================
  IF v_has_budget AND v_budget_utilization >= 110 THEN
    v_hard_override := 'budget_over_110';
  END IF;

  SELECT COUNT(*)
  INTO v_critical_milestone_overdue_7d
  FROM public.project_milestones
  WHERE project_id = p_project_id
    AND priority = 'critical'
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE - INTERVAL '7 days'
    AND status NOT IN ('completed', 'cancelled');

  IF v_critical_milestone_overdue_7d > 0 THEN
    v_hard_override := COALESCE(v_hard_override, 'critical_milestone_overdue_7d');
  END IF;

  IF v_project.status = 'active' AND v_project.end_date < CURRENT_DATE - INTERVAL '14 days' THEN
    v_hard_override := COALESCE(v_hard_override, 'project_overdue_14d');
  END IF;

  -- ================================================================
  -- CLASSIFICATION
  -- ================================================================
  IF v_hard_override IS NOT NULL THEN
    v_status := 'at_risk';
    v_score := LEAST(v_score, 59);
  ELSIF v_score >= 80 THEN
    v_status := 'healthy';
  ELSIF v_score >= 60 THEN
    v_status := 'attention';
  ELSE
    v_status := 'at_risk';
  END IF;

  -- ================================================================
  -- FORECAST COMPLETION DATE
  -- ================================================================
  IF v_progress IS NOT NULL AND v_progress >= 10
     AND v_project.status = 'active'
     AND v_project.start_date <= CURRENT_DATE THEN
    v_elapsed_days := GREATEST((CURRENT_DATE - v_project.start_date), 0);
    IF v_elapsed_days > 0 AND v_progress < 100 THEN
      v_velocity := v_progress / v_elapsed_days;
      v_remaining := 100 - v_progress;
      v_forecast_days := v_remaining / v_velocity;
      -- Cap at 10 years to avoid date overflow
      v_forecast_days := LEAST(v_forecast_days, 3650);
      v_forecast_completion_date := CURRENT_DATE + v_forecast_days * INTERVAL '1 day';
    ELSIF v_progress >= 100 THEN
      v_forecast_completion_date := NULL;
    END IF;
  END IF;

  -- ================================================================
  -- FORECAST LABOR COST
  -- ================================================================
  IF v_progress IS NOT NULL AND v_progress >= 10 THEN
    v_approved_labor_cost := public.get_project_realized_labor_cost(p_project_id, NULL, NULL);
    IF v_approved_labor_cost > 0 AND v_progress < 100 THEN
      v_forecast_labor_cost := ROUND(v_approved_labor_cost / (v_progress / 100.0), 2);
    ELSIF v_progress >= 100 THEN
      v_forecast_labor_cost := v_approved_labor_cost;
    END IF;
  END IF;

  -- ================================================================
  -- DRIVERS (structured explanation)
  -- ================================================================
  v_drivers := jsonb_build_object(
    'schedule', jsonb_build_object(
      'overdue_end_penalty', v_overdue_end_penalty,
      'overdue_milestones', v_overdue_milestones_count,
      'milestone_penalty', v_milestone_schedule_penalty,
      'overdue_tasks', v_overdue_tasks_count,
      'task_penalty', v_task_schedule_penalty,
      'penalty', v_schedule_penalty
    ),
    'budget', jsonb_build_object(
      'has_budget', v_has_budget,
      'utilization', v_budget_utilization,
      'penalty', v_budget_penalty
    ),
    'profitability', jsonb_build_object(
      'active_alerts', v_active_alerts_count,
      'penalty', v_profitability_penalty
    ),
    'capacity', jsonb_build_object(
      'available', v_capacity_available,
      'overallocated_members', v_overallocated_members,
      'max_utilization', ROUND(v_max_utilization, 1),
      'cross_project', true,
      'penalty', v_capacity_penalty
    ),
    'critical_delivery', jsonb_build_object(
      'critical_milestones_blocked', v_critical_milestones_blocked,
      'critical_milestones_overdue', v_critical_milestones_overdue,
      'critical_milestones_due_soon', v_critical_milestones_due_soon,
      'critical_tasks_blocked', v_critical_tasks_blocked,
      'critical_tasks_overdue', v_critical_tasks_overdue,
      'critical_tasks_due_soon', v_critical_tasks_due_soon,
      'penalty', v_critical_delivery_penalty
    ),
    'hard_override', v_hard_override
  );

  RETURN jsonb_build_object(
    'score', v_score,
    'status', v_status,
    'progress', v_progress,
    'budget_utilization', v_budget_utilization,
    'forecast_completion_date', v_forecast_completion_date,
    'forecast_labor_cost', v_forecast_labor_cost,
    'drivers', v_drivers
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_project_health_internal(UUID) FROM PUBLIC;

-- Public wrapper: admin-only, delegates to internal
CREATE OR REPLACE FUNCTION public.calculate_project_health(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;
  RETURN public.calculate_project_health_internal(p_project_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_project_health(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_project_health(UUID) TO authenticated;

-- ============================================================================
-- 8b. Update recalculate_project_health to use internal calculation
--     (avoids double admin check and ensures triggers/admin use same logic)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_project_health(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_health JSONB;
  v_score INTEGER;
  v_status TEXT;
  v_progress NUMERIC;
  v_budget_util NUMERIC;
  v_forecast_date DATE;
  v_forecast_cost NUMERIC;
  v_drivers JSONB;
  v_prev_state public.project_health_states%ROWTYPE;
  v_has_prev BOOLEAN := false;
  v_prev_status TEXT;
  v_prev_score INTEGER;
  v_event_id UUID;
BEGIN
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Calculate fresh health using internal (no auth check)
  v_health := public.calculate_project_health_internal(p_project_id);
  v_score := (v_health->>'score')::INTEGER;
  v_status := v_health->>'status';
  v_progress := NULLIF(v_health->>'progress', '')::NUMERIC;
  v_budget_util := NULLIF(v_health->>'budget_utilization', '')::NUMERIC;
  v_forecast_date := NULLIF(v_health->>'forecast_completion_date', '')::DATE;
  v_forecast_cost := NULLIF(v_health->>'forecast_labor_cost', '')::NUMERIC;
  v_drivers := v_health->'drivers';

  -- Check for existing state
  SELECT * INTO v_prev_state FROM public.project_health_states WHERE project_id = p_project_id;
  v_has_prev := FOUND;
  v_prev_status := v_prev_state.health_status;
  v_prev_score := v_prev_state.health_score;

  -- Upsert current state
  INSERT INTO public.project_health_states (
    project_id, health_score, health_status, progress_percent,
    budget_utilization, forecast_completion_date, forecast_labor_cost,
    drivers, calculated_at
  ) VALUES (
    p_project_id, v_score, v_status, v_progress,
    v_budget_util, v_forecast_date, v_forecast_cost,
    v_drivers, now()
  )
  ON CONFLICT (project_id) DO UPDATE SET
    health_score = EXCLUDED.health_score,
    health_status = EXCLUDED.health_status,
    progress_percent = EXCLUDED.progress_percent,
    budget_utilization = EXCLUDED.budget_utilization,
    forecast_completion_date = EXCLUDED.forecast_completion_date,
    forecast_labor_cost = EXCLUDED.forecast_labor_cost,
    drivers = EXCLUDED.drivers,
    calculated_at = EXCLUDED.calculated_at;

  -- Emit transition event only when status CHANGES
  IF NOT v_has_prev OR v_prev_status IS DISTINCT FROM v_status THEN
    INSERT INTO public.project_health_events (
      project_id, previous_status, new_status, previous_score, new_score, drivers
    ) VALUES (
      p_project_id, v_prev_status, v_status, v_prev_score, v_score, v_drivers
    )
    RETURNING id INTO v_event_id;

    -- Send notifications for relevant transitions (not initial backfill)
    IF v_status IN ('healthy', 'attention', 'at_risk')
       AND (v_prev_status IS NULL OR v_prev_status IN ('healthy', 'attention', 'at_risk'))
       AND v_status IS DISTINCT FROM v_prev_status THEN
      PERFORM public.notify_project_health_change(p_project_id, v_prev_status, v_status, v_score, v_event_id);
    END IF;
  END IF;

  RETURN v_health;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_project_health(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_project_health(UUID) TO authenticated;

-- ============================================================================
-- 9. Internal recalculation helper (no auth check — for triggers)
--    Uses service_role context. Triggers call this to avoid auth.uid() issues.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_project_health_internal(p_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_health JSONB;
  v_score INTEGER;
  v_status TEXT;
  v_progress NUMERIC;
  v_budget_util NUMERIC;
  v_forecast_date DATE;
  v_forecast_cost NUMERIC;
  v_drivers JSONB;
  v_prev_state public.project_health_states%ROWTYPE;
  v_has_prev BOOLEAN := false;
  v_prev_status TEXT;
  v_prev_score INTEGER;
  v_event_id UUID;
BEGIN
  -- Calculate fresh health (bypass admin check by calling internal directly)
  v_health := public.calculate_project_health_internal(p_project_id);
  v_score := (v_health->>'score')::INTEGER;
  v_status := v_health->>'status';
  v_progress := NULLIF(v_health->>'progress', '')::NUMERIC;
  v_budget_util := NULLIF(v_health->>'budget_utilization', '')::NUMERIC;
  v_forecast_date := NULLIF(v_health->>'forecast_completion_date', '')::DATE;
  v_forecast_cost := NULLIF(v_health->>'forecast_labor_cost', '')::NUMERIC;
  v_drivers := v_health->'drivers';

  -- Check for existing state
  SELECT * INTO v_prev_state FROM public.project_health_states WHERE project_id = p_project_id;
  v_has_prev := FOUND;
  v_prev_status := v_prev_state.health_status;
  v_prev_score := v_prev_state.health_score;

  -- Upsert current state
  INSERT INTO public.project_health_states (
    project_id, health_score, health_status, progress_percent,
    budget_utilization, forecast_completion_date, forecast_labor_cost,
    drivers, calculated_at
  ) VALUES (
    p_project_id, v_score, v_status, v_progress,
    v_budget_util, v_forecast_date, v_forecast_cost,
    v_drivers, now()
  )
  ON CONFLICT (project_id) DO UPDATE SET
    health_score = EXCLUDED.health_score,
    health_status = EXCLUDED.health_status,
    progress_percent = EXCLUDED.progress_percent,
    budget_utilization = EXCLUDED.budget_utilization,
    forecast_completion_date = EXCLUDED.forecast_completion_date,
    forecast_labor_cost = EXCLUDED.forecast_labor_cost,
    drivers = EXCLUDED.drivers,
    calculated_at = EXCLUDED.calculated_at;

  -- Emit transition event only when status CHANGES (not score-only changes)
  IF NOT v_has_prev OR v_prev_status IS DISTINCT FROM v_status THEN
    INSERT INTO public.project_health_events (
      project_id, previous_status, new_status, previous_score, new_score, drivers
    ) VALUES (
      p_project_id, v_prev_status, v_status, v_prev_score, v_score, v_drivers
    )
    RETURNING id INTO v_event_id;

    -- Send notifications only for meaningful transitions (not initial backfill)
    IF v_has_prev AND v_status IN ('healthy', 'attention', 'at_risk')
       AND v_prev_status IN ('healthy', 'attention', 'at_risk')
       AND v_status IS DISTINCT FROM v_prev_status THEN
      PERFORM public.notify_project_health_change(p_project_id, v_prev_status, v_status, v_score, v_event_id);
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_project_health_internal(UUID) FROM PUBLIC;

-- ============================================================================
-- 10. Automatic recalculation triggers
--     Fires AFTER relevant mutations. Calls internal recalc which avoids
--     auth checks and suppresses notifications on initial creation.
-- ============================================================================

-- Milestones: AFTER INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.trg_recalc_health_on_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  IF v_project_id IS NOT NULL THEN
    PERFORM public.recalculate_project_health_internal(v_project_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_health_milestone ON public.project_milestones;
CREATE TRIGGER trg_recalc_health_milestone
  AFTER INSERT OR UPDATE OR DELETE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_health_on_milestone();

-- Tasks: AFTER INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.trg_recalc_health_on_task()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  IF v_project_id IS NOT NULL THEN
    PERFORM public.recalculate_project_health_internal(v_project_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_health_task ON public.project_tasks;
CREATE TRIGGER trg_recalc_health_task
  AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_health_on_task();

-- Budgets: AFTER INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.trg_recalc_health_on_budget()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  IF v_project_id IS NOT NULL THEN
    PERFORM public.recalculate_project_health_internal(v_project_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_health_budget ON public.project_budgets;
CREATE TRIGGER trg_recalc_health_budget
  AFTER INSERT OR UPDATE OR DELETE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_health_on_budget();

-- Profitability alerts: AFTER INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.trg_recalc_health_on_alert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  IF v_project_id IS NOT NULL THEN
    PERFORM public.recalculate_project_health_internal(v_project_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_health_alert ON public.profitability_alerts;
CREATE TRIGGER trg_recalc_health_alert
  AFTER INSERT OR UPDATE ON public.profitability_alerts
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_health_on_alert();

-- Allocations: AFTER INSERT/UPDATE/DELETE
-- Recalculates ALL projects the professional is allocated to (cross-project impact)
CREATE OR REPLACE FUNCTION public.trg_recalc_health_on_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prof_id UUID;
  v_proj_id UUID;
BEGIN
  v_prof_id := COALESCE(NEW.professional_id, OLD.professional_id);
  IF v_prof_id IS NOT NULL THEN
    -- Recalculate all projects this professional is allocated to
    -- (because cross-project capacity changed)
    PERFORM public.recalculate_project_health_internal(pa.project_id)
    FROM public.project_allocations pa
    WHERE pa.professional_id = v_prof_id
      AND pa.start_date <= (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE
      AND pa.end_date >= date_trunc('week', CURRENT_DATE)::DATE;
  END IF;
  -- Also recalculate the specific project if it changed
  v_proj_id := COALESCE(NEW.project_id, OLD.project_id);
  IF v_proj_id IS NOT NULL THEN
    PERFORM public.recalculate_project_health_internal(v_proj_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_health_allocation ON public.project_allocations;
CREATE TRIGGER trg_recalc_health_allocation
  AFTER INSERT OR UPDATE OR DELETE ON public.project_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_health_on_allocation();

-- Capacity rules: AFTER INSERT/UPDATE/DELETE
-- Recalculates all projects the professional is a member of
CREATE OR REPLACE FUNCTION public.trg_recalc_health_on_capacity_rule()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prof_id UUID;
BEGIN
  v_prof_id := COALESCE(NEW.professional_id, OLD.professional_id);
  IF v_prof_id IS NOT NULL THEN
    -- Recalculate all projects this professional is allocated to
    PERFORM public.recalculate_project_health_internal(pa.project_id)
    FROM public.project_allocations pa
    WHERE pa.professional_id = v_prof_id
      AND pa.start_date <= (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE
      AND pa.end_date >= date_trunc('week', CURRENT_DATE)::DATE;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_health_capacity_rule ON public.professional_capacity_rules;
CREATE TRIGGER trg_recalc_health_capacity_rule
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_capacity_rules
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_health_on_capacity_rule();

-- Projects: AFTER UPDATE (start_date, end_date, status)
CREATE OR REPLACE FUNCTION public.trg_recalc_health_on_project()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only recalculate if relevant fields changed
  IF NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.recalculate_project_health_internal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_health_project ON public.projects;
CREATE TRIGGER trg_recalc_health_project
  AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_health_on_project();

-- Time entries: AFTER UPDATE (only when approval_status changes to/from 'approved')
CREATE OR REPLACE FUNCTION public.trg_recalc_health_on_time_entry()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only recalculate when approval_status changes (affects actual labor cost)
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    PERFORM public.recalculate_project_health_internal(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_health_time_entry ON public.time_entries;
CREATE TRIGGER trg_recalc_health_time_entry
  AFTER UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_health_on_time_entry();

-- ============================================================================
-- 11. Update search_global — milestone isolation via project membership
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_global(
  p_query TEXT,
  p_limit INTEGER DEFAULT 8
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_results JSONB;
  v_projects JSONB;
  v_tasks JSONB;
  v_milestones JSONB;
  v_professionals JSONB;
  v_time_entries JSONB;
  v_effective_limit INTEGER := LEAST(p_limit, 20);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object(
      'projects', '[]'::jsonb,
      'tasks', '[]'::jsonb,
      'milestones', '[]'::jsonb,
      'professionals', '[]'::jsonb,
      'time_entries', '[]'::jsonb
    );
  END IF;

  SELECT public.is_admin(v_user_id) INTO v_is_admin;

  -- Projects
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'project',
    'id', p.id,
    'title', p.name,
    'subtitle', p.client,
    'href', '/projects/' || p.id
  ) ORDER BY p.name), '[]'::jsonb) INTO v_projects
  FROM (
    SELECT p.id, p.name, p.client
    FROM projects p
    WHERE p.name ILIKE '%' || trim(p_query) || '%'
       OR p.client ILIKE '%' || trim(p_query) || '%'
    ORDER BY p.name
    LIMIT v_effective_limit
  ) p;

  -- Tasks
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'task',
    'id', pt.id,
    'title', pt.title,
    'subtitle', proj.name,
    'href', '/projects/' || pt.project_id || '?tab=tasks&task=' || pt.id
  ) ORDER BY pt.title), '[]'::jsonb) INTO v_tasks
  FROM (
    SELECT pt.id, pt.project_id, pt.title
    FROM project_tasks pt
    WHERE pt.title ILIKE '%' || trim(p_query) || '%'
    ORDER BY pt.title
    LIMIT v_effective_limit
  ) pt
  JOIN projects proj ON proj.id = pt.project_id;

  -- Milestones — filtered by project membership (RLS enforces this, but
  -- SECURITY INVOKER means RLS applies to the calling user)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'milestone',
    'id', pm.id,
    'title', pm.name,
    'subtitle', proj.name,
    'href', '/projects/' || pm.project_id || '?tab=milestones&milestone=' || pm.id
  ) ORDER BY pm.name), '[]'::jsonb) INTO v_milestones
  FROM (
    SELECT pm.id, pm.project_id, pm.name
    FROM project_milestones pm
    WHERE pm.name ILIKE '%' || trim(p_query) || '%'
    ORDER BY pm.name
    LIMIT v_effective_limit
  ) pm
  JOIN projects proj ON proj.id = pm.project_id;

  -- Professionals (admin only)
  IF v_is_admin THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', 'professional',
      'id', pr.id,
      'title', pr.full_name,
      'subtitle', pr.role,
      'href', '/admin/professionals?professional=' || pr.id
    ) ORDER BY pr.full_name), '[]'::jsonb) INTO v_professionals
    FROM (
      SELECT pr.id, pr.full_name, pr.role
      FROM profiles pr
      WHERE pr.full_name ILIKE '%' || trim(p_query) || '%'
      ORDER BY pr.full_name
      LIMIT v_effective_limit
    ) pr;
  ELSE
    v_professionals := '[]'::jsonb;
  END IF;

  -- Time entries
  IF v_is_admin THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', 'time_entry',
      'id', te.id,
      'title', left(te.description, 60),
      'subtitle', pr.full_name || ' — ' || proj.name || ' — ' || te.entry_date::TEXT,
      'href', '/admin/time-entries?entry=' || te.id
    ) ORDER BY te.entry_date DESC, te.created_at DESC), '[]'::jsonb) INTO v_time_entries
    FROM (
      SELECT te.id, te.professional_id, te.project_id, te.description, te.entry_date, te.created_at
      FROM time_entries te
      WHERE te.description ILIKE '%' || trim(p_query) || '%'
      ORDER BY te.entry_date DESC, te.created_at DESC
      LIMIT v_effective_limit
    ) te
    JOIN profiles pr ON pr.id = te.professional_id
    JOIN projects proj ON proj.id = te.project_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', 'time_entry',
      'id', te.id,
      'title', left(te.description, 60),
      'subtitle', proj.name || ' — ' || te.entry_date::TEXT,
      'href', '/time-entries?entry=' || te.id
    ) ORDER BY te.entry_date DESC, te.created_at DESC), '[]'::jsonb) INTO v_time_entries
    FROM (
      SELECT te.id, te.project_id, te.description, te.entry_date, te.created_at
      FROM time_entries te
      WHERE te.professional_id = v_user_id
        AND te.description ILIKE '%' || trim(p_query) || '%'
      ORDER BY te.entry_date DESC, te.created_at DESC
      LIMIT v_effective_limit
    ) te
    JOIN projects proj ON proj.id = te.project_id;
  END IF;

  v_results := jsonb_build_object(
    'projects', v_projects,
    'tasks', v_tasks,
    'milestones', v_milestones,
    'professionals', v_professionals,
    'time_entries', v_time_entries
  );

  RETURN v_results;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_global(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_global(TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- 12a. Internal backfill helper (no auth check — for migration execution)
--      Calculates health for all active/planned projects that don't have
--      a canonical state yet. Suppresses notifications (initial backfill).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.backfill_project_health_internal()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  v_count INTEGER := 0;
  v_errors JSONB := '[]'::jsonb;
BEGIN
  FOR v_project_id IN
    SELECT p.id FROM public.projects p
    WHERE p.status IN ('active', 'planned')
      AND NOT EXISTS (
        SELECT 1 FROM public.project_health_states phs WHERE phs.project_id = p.id
      )
  LOOP
    BEGIN
      PERFORM public.recalculate_project_health_internal(v_project_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('project_id', v_project_id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('backfilled', v_count, 'errors', v_errors);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_project_health_internal() FROM PUBLIC;

-- ============================================================================
-- 12b. Admin-facing backfill function (auth-checked wrapper)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.backfill_project_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_project_id UUID;
  v_count INTEGER := 0;
  v_errors JSONB := '[]'::jsonb;
BEGIN
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  FOR v_project_id IN
    SELECT p.id FROM public.projects p
    WHERE p.status IN ('active', 'planned')
      AND NOT EXISTS (
        SELECT 1 FROM public.project_health_states phs WHERE phs.project_id = p.id
      )
  LOOP
    BEGIN
      -- Use internal recalc which suppresses notifications on initial creation
      PERFORM public.recalculate_project_health_internal(v_project_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('project_id', v_project_id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('backfilled', v_count, 'errors', v_errors);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_project_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_project_health() TO authenticated;

-- ============================================================================
-- 13. Execute backfill for existing projects (safe — no notifications)
-- ============================================================================
SELECT public.backfill_project_health_internal();
