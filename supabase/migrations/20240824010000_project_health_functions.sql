-- ===========================================================================
-- Phase 6: Health Calculation RPCs, Progress, Forecast, Notifications
--
-- This migration implements the server-side Project Health engine:
--
--   * get_project_progress(project_id) — canonical weighted progress
--   * calculate_project_health(project_id) — compute score + drivers (admin)
--   * recalculate_project_health(project_id) — persist state + emit events
--   * recalculate_all_project_health() — batch recalculation (admin)
--   * get_project_health(project_id) — current state (admin: full / member: sanitized)
--   * get_projects_health_summary(filter) — admin overview
--   * get_project_health_history(project_id) — transition events
--   * search_global updated to include milestones
--
-- Health V1 Algorithm (deterministic, no AI, no random):
--   Start at 100, apply penalties:
--     A. Schedule      (max 30): overdue project end, overdue milestones, overdue tasks
--     B. Budget        (max 30): labor_cost budget utilization tiers
--     C. Profitability (max 15): unacknowledged profitability alerts
--     D. Capacity      (max 10): over-allocation of project members
--     E. Critical Delivery (max 15): critical milestone/task blocked/overdue/due-soon
--   Hard overrides → at_risk:
--     - budget >= 110%
--     - critical milestone overdue > 7 days
--     - project active > 14 days past end_date
--   Classification: 80-100 healthy, 60-79.99 attention, 0-59.99 at_risk
--   not_applicable for completed/cancelled projects.
-- ===========================================================================

-- ===========================================================================
-- 1. get_project_progress(p_project_id) — canonical weighted progress
--
-- Returns NUMERIC(5,2):
--   * If milestones exist (excluding cancelled): weighted milestone progress
--   * Else if tasks exist (excluding cancelled): done / non-cancelled ratio
--   * Else NULL (insufficient data — NOT 0)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_project_progress(p_project_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_milestone_progress NUMERIC;
  v_total_weight NUMERIC := 0;
  v_weighted_sum NUMERIC := 0;
  v_done_tasks INTEGER := 0;
  v_non_cancelled_tasks INTEGER := 0;
  v_result NUMERIC;
BEGIN
  -- Weighted milestone progress (exclude cancelled from denominator)
  SELECT
    COALESCE(SUM(pm.progress_percent * pm.weight), 0),
    COALESCE(SUM(pm.weight), 0)
  INTO v_weighted_sum, v_total_weight
  FROM public.project_milestones pm
  WHERE pm.project_id = p_project_id
    AND pm.status != 'cancelled';

  IF v_total_weight > 0 THEN
    v_result := ROUND(v_weighted_sum / v_total_weight, 2);
    RETURN LEAST(GREATEST(v_result, 0), 100);
  END IF;

  -- Fallback: task-based progress
  SELECT
    COUNT(*) FILTER (WHERE status = 'done'),
    COUNT(*) FILTER (WHERE status != 'cancelled')
  INTO v_done_tasks, v_non_cancelled_tasks
  FROM public.project_tasks
  WHERE project_id = p_project_id;

  IF v_non_cancelled_tasks > 0 THEN
    v_result := ROUND((v_done_tasks::NUMERIC / v_non_cancelled_tasks) * 100, 2);
    RETURN LEAST(GREATEST(v_result, 0), 100);
  END IF;

  -- No milestones and no tasks → NULL (insufficient data)
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_project_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_progress(UUID) TO authenticated;

-- ===========================================================================
-- 2. calculate_project_health(p_project_id) — compute score + drivers
--
-- Returns JSONB with: score, status, progress, budget_utilization,
-- forecast_completion_date, forecast_labor_cost, drivers (structured).
-- Admin-only (exposes financial data).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.calculate_project_health(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_project public.projects%ROWTYPE;
  v_score INTEGER := 100;
  v_status TEXT;
  v_progress NUMERIC;
  v_budget_value NUMERIC := 0;
  v_realized_labor NUMERIC := 0;
  v_budget_utilization NUMERIC := 0;
  v_has_budget BOOLEAN := false;

  -- Schedule penalties
  v_overdue_end_penalty INTEGER := 0;
  v_overdue_milestones_count INTEGER := 0;
  v_overdue_tasks_count INTEGER := 0;
  v_milestone_schedule_penalty INTEGER := 0;
  v_task_schedule_penalty INTEGER := 0;
  v_schedule_penalty INTEGER := 0;

  -- Budget penalty
  v_budget_penalty INTEGER := 0;

  -- Profitability penalty
  v_active_alerts_count INTEGER := 0;
  v_profitability_penalty INTEGER := 0;

  -- Capacity penalty
  v_overallocated_members INTEGER := 0;
  v_max_utilization NUMERIC := 0;
  v_capacity_penalty INTEGER := 0;
  v_capacity_available BOOLEAN := false;

  -- Critical delivery penalty
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
  v_days_past_end INTEGER := 0;

  -- Forecast
  v_forecast_completion_date DATE := NULL;
  v_forecast_labor_cost NUMERIC := NULL;
  v_elapsed_days INTEGER := 0;
  v_velocity NUMERIC := 0;
  v_remaining NUMERIC := 0;
  v_forecast_days NUMERIC := 0;
  v_approved_labor_cost NUMERIC := 0;

  v_drivers JSONB;
BEGIN
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

  -- not_applicable for completed/cancelled projects
  IF v_project.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'score', NULL,
      'status', 'not_applicable',
      'progress', public.get_project_progress(p_project_id),
      'budget_utilization', NULL,
      'forecast_completion_date', NULL,
      'forecast_labor_cost', NULL,
      'drivers', jsonb_build_object('reason', 'project_not_active')
    );
  END IF;

  -- ---- Progress ----
  v_progress := public.get_project_progress(p_project_id);

  -- ---- Budget ----
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

  -- ================================================================
  -- A. SCHEDULE (max 30)
  -- ================================================================

  -- Active project with end_date passed
  IF v_project.status = 'active' AND v_project.end_date < CURRENT_DATE THEN
    v_overdue_end_penalty := 15;
  END IF;

  -- Overdue milestones (due_date < today, not completed/cancelled)
  SELECT COUNT(*)
  INTO v_overdue_milestones_count
  FROM public.project_milestones
  WHERE project_id = p_project_id
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE
    AND status NOT IN ('completed', 'cancelled');

  -- Milestone schedule penalty: scale with count (cap 10)
  -- 1 milestone = 3, 2 = 5, 3 = 7, 4 = 9, 5+ = 10
  IF v_overdue_milestones_count >= 5 THEN
    v_milestone_schedule_penalty := 10;
  ELSIF v_overdue_milestones_count > 0 THEN
    v_milestone_schedule_penalty := LEAST(2 + v_overdue_milestones_count, 10);
  END IF;

  -- Overdue tasks
  SELECT COUNT(*)
  INTO v_overdue_tasks_count
  FROM public.project_tasks
  WHERE project_id = p_project_id
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE
    AND status NOT IN ('done', 'cancelled');

  -- Task schedule penalty: scale with count (cap 5)
  -- 1 task = 2, 2-3 = 3, 4-6 = 4, 7+ = 5
  IF v_overdue_tasks_count >= 7 THEN
    v_task_schedule_penalty := 5;
  ELSIF v_overdue_tasks_count >= 4 THEN
    v_task_schedule_penalty := 4;
  ELSIF v_overdue_tasks_count >= 2 THEN
    v_task_schedule_penalty := 3;
  ELSIF v_overdue_tasks_count >= 1 THEN
    v_task_schedule_penalty := 2;
  END IF;

  v_schedule_penalty := LEAST(v_overdue_end_penalty + v_milestone_schedule_penalty + v_task_schedule_penalty, 30);

  -- ================================================================
  -- B. BUDGET (max 30)
  -- ================================================================
  IF v_has_budget THEN
    IF v_budget_utilization >= 100 THEN
      v_budget_penalty := 30;
    ELSIF v_budget_utilization >= 90 THEN
      v_budget_penalty := 20;
    ELSIF v_budget_utilization >= 80 THEN
      v_budget_penalty := 10;
    ELSE
      v_budget_penalty := 0;
    END IF;
  END IF;

  -- ================================================================
  -- C. PROFITABILITY (max 15)
  -- ================================================================
  SELECT COUNT(*)
  INTO v_active_alerts_count
  FROM public.profitability_alerts
  WHERE project_id = p_project_id
    AND acknowledged_by IS NULL;

  -- Each unacknowledged alert: 5 points, cap 15
  IF v_active_alerts_count > 0 THEN
    v_profitability_penalty := LEAST(v_active_alerts_count * 5, 15);
  END IF;

  -- ================================================================
  -- D. CAPACITY (max 10)
  -- ================================================================
  -- Check over-allocation of project members for the current week.
  -- Uses the same proration logic as get_capacity_overview.
  WITH member_alloc AS (
    SELECT
      pa.professional_id,
      SUM(
        (LEAST(pa.end_date, (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE)
         - GREATEST(pa.start_date, date_trunc('week', CURRENT_DATE)::DATE) + 1)::NUMERIC
        / NULLIF(GREATEST(pa.end_date - pa.start_date + 1, 1), 0)
        * pa.allocated_minutes
      ) AS allocated_minutes
    FROM public.project_allocations pa
    WHERE pa.project_id = p_project_id
      AND pa.start_date <= (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE
      AND pa.end_date >= date_trunc('week', CURRENT_DATE)::DATE
    GROUP BY pa.professional_id
  ),
  member_cap AS (
    SELECT
      ma.professional_id,
      ma.allocated_minutes,
      cr.weekly_capacity_minutes
    FROM member_alloc ma
    LEFT JOIN LATERAL (
      SELECT cr2.weekly_capacity_minutes
      FROM public.professional_capacity_rules cr2
      WHERE cr2.professional_id = ma.professional_id
        AND cr2.valid_from <= date_trunc('week', CURRENT_DATE)::DATE
        AND (cr2.valid_until IS NULL OR cr2.valid_until >= date_trunc('week', CURRENT_DATE)::DATE)
      ORDER BY cr2.valid_from DESC
      LIMIT 1
    ) cr ON true
  )
  SELECT
    COUNT(*) FILTER (WHERE weekly_capacity_minutes IS NOT NULL AND allocated_minutes > weekly_capacity_minutes),
    COALESCE(MAX(
      CASE WHEN weekly_capacity_minutes IS NOT NULL AND weekly_capacity_minutes > 0
           THEN (allocated_minutes::NUMERIC / weekly_capacity_minutes) * 100
           ELSE NULL END
    ), 0)
  INTO v_overallocated_members, v_max_utilization
  FROM member_cap;

  v_capacity_available := EXISTS (
    SELECT 1 FROM public.professional_capacity_rules cr
    JOIN public.project_members pm ON pm.professional_id = cr.professional_id
    WHERE pm.project_id = p_project_id
      AND cr.valid_from <= CURRENT_DATE
      AND (cr.valid_until IS NULL OR cr.valid_until >= CURRENT_DATE)
  );

  IF v_capacity_available AND v_overallocated_members > 0 THEN
    -- Over 110% → max penalty (10); over 100% → scaled
    IF v_max_utilization > 110 THEN
      v_capacity_penalty := 10;
    ELSIF v_max_utilization > 100 THEN
      v_capacity_penalty := 7;
    END IF;
  END IF;
  -- If capacity data doesn't exist, penalty stays 0 (neutral — don't penalize absence)

  -- ================================================================
  -- E. CRITICAL DELIVERY (max 15)
  -- ================================================================

  -- Critical milestones: blocked, overdue, or due soon (<=7 days)
  SELECT
    COUNT(*) FILTER (WHERE status = 'blocked'),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days')
  INTO v_critical_milestones_blocked, v_critical_milestones_overdue, v_critical_milestones_due_soon
  FROM public.project_milestones
  WHERE project_id = p_project_id
    AND priority = 'critical'
    AND status NOT IN ('completed', 'cancelled');

  -- Critical tasks: blocked, overdue, or due soon
  SELECT
    COUNT(*) FILTER (WHERE status = 'blocked'),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days')
  INTO v_critical_tasks_blocked, v_critical_tasks_overdue, v_critical_tasks_due_soon
  FROM public.project_tasks
  WHERE project_id = p_project_id
    AND priority = 'critical'
    AND status NOT IN ('done', 'cancelled');

  -- Each critical issue: 5 points, cap 15
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

  -- budget >= 110%
  IF v_has_budget AND v_budget_utilization >= 110 THEN
    v_hard_override := 'budget_over_110';
  END IF;

  -- critical milestone overdue > 7 days
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

  -- project active > 14 days past end_date
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
  -- Only when progress >= 10% and project has started
  IF v_progress IS NOT NULL AND v_progress >= 10
     AND v_project.status = 'active'
     AND v_project.start_date <= CURRENT_DATE THEN
    v_elapsed_days := GREATEST((CURRENT_DATE - v_project.start_date), 0);
    IF v_elapsed_days > 0 AND v_progress < 100 THEN
      v_velocity := v_progress / v_elapsed_days;
      v_remaining := 100 - v_progress;
      v_forecast_days := v_remaining / v_velocity;
      v_forecast_completion_date := CURRENT_DATE + v_forecast_days * INTERVAL '1 day';
    ELSIF v_progress >= 100 THEN
      -- Already complete — no future forecast
      v_forecast_completion_date := NULL;
    END IF;
  END IF;

  -- ================================================================
  -- FORECAST LABOR COST
  -- ================================================================
  -- forecast_labor_cost = approved_labor_cost / (progress / 100)
  -- Only when progress >= 10%
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

REVOKE EXECUTE ON FUNCTION public.calculate_project_health(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_project_health(UUID) TO authenticated;

-- ===========================================================================
-- 3. recalculate_project_health(p_project_id)
--    Persists state, emits transition events, sends notifications.
--    Admin-only.
-- ===========================================================================
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

  -- Calculate fresh health
  v_health := public.calculate_project_health(p_project_id);
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
  -- (score changing within the same status does NOT create an event)
  IF NOT v_has_prev OR v_prev_status IS DISTINCT FROM v_status THEN
    INSERT INTO public.project_health_events (
      project_id, previous_status, new_status, previous_score, new_score, drivers
    ) VALUES (
      p_project_id, v_prev_status, v_status, v_prev_score, v_score, v_drivers
    )
    RETURNING id INTO v_event_id;

    -- Send notifications for relevant transitions
    -- healthy→attention, attention→at_risk, healthy→at_risk (deterioration)
    -- at_risk→attention, attention→healthy (recovery)
    -- not_applicable transitions do NOT notify
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

-- ===========================================================================
-- 4. notify_project_health_change — internal helper
--    Notifies admins + project manager/technical lead.
--    1 transition = 1 notification per recipient.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_project_health_change(
  p_project_id UUID,
  p_prev_status TEXT,
  p_new_status TEXT,
  p_score INTEGER,
  p_event_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_name TEXT;
  v_title TEXT;
  v_body TEXT;
  v_recipient UUID;
  v_status_labels JSONB := jsonb_build_object(
    'healthy', 'Saudável',
    'attention', 'Em Atenção',
    'at_risk', 'Em Risco'
  );
BEGIN
  SELECT name INTO v_project_name FROM public.projects WHERE id = p_project_id;

  -- Build message based on direction
  IF p_new_status = 'at_risk' THEN
    v_title := 'Projeto entrou em risco';
    v_body := 'O projeto "' || v_project_name || '" mudou para Em Risco (score: ' || p_score || '/100).';
  ELSIF p_new_status = 'attention' AND (p_prev_status = 'at_risk' OR p_prev_status IS NULL) THEN
    v_title := 'Projeto requer atenção';
    v_body := 'O projeto "' || v_project_name || '" mudou para Em Atenção (score: ' || p_score || '/100).';
  ELSIF p_new_status = 'attention' AND p_prev_status = 'healthy' THEN
    v_title := 'Projeto requer atenção';
    v_body := 'O projeto "' || v_project_name || '" mudou de Saudável para Em Atenção (score: ' || p_score || '/100).';
  ELSIF p_new_status = 'healthy' THEN
    v_title := 'Projeto recuperou saúde';
    v_body := 'O projeto "' || v_project_name || '" mudou para Saudável (score: ' || p_score || '/100).';
  ELSE
    v_title := 'Saúde do projeto atualizada';
    v_body := 'O projeto "' || v_project_name || '" mudou de '
      || COALESCE(v_status_labels->>p_prev_status, '—')
      || ' para ' || COALESCE(v_status_labels->>p_new_status, '—')
      || ' (score: ' || p_score || '/100).';
  END IF;

  -- Notify all admins + project manager/technical lead (deduplicated)
  -- A user who is both admin and manager/lead should only get ONE notification.
  FOR v_recipient IN
    SELECT id FROM public.profiles WHERE role = 'admin'
    UNION
    SELECT professional_id FROM public.project_members
    WHERE project_id = p_project_id
      AND project_role IN ('manager', 'technical_lead')
  LOOP
    PERFORM public.create_notification(
      v_recipient,
      'project_health_changed',
      v_title,
      v_body,
      'project',
      p_project_id
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_project_health_change(UUID, TEXT, TEXT, INTEGER, UUID) FROM PUBLIC;

-- ===========================================================================
-- 5. recalculate_all_project_health() — batch (admin)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.recalculate_all_project_health()
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
    SELECT id FROM public.projects WHERE status IN ('active', 'planned', 'completed', 'cancelled')
  LOOP
    BEGIN
      -- Call the calculation directly (bypass per-project admin check since
      -- we already verified admin above). We use a SECURITY INVOKER wrapper
      -- to avoid the auth check inside calculate_project_health.
      PERFORM public.recalculate_project_health(v_project_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('project_id', v_project_id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('recalculated', v_count, 'errors', v_errors);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_all_project_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_all_project_health() TO authenticated;

-- ===========================================================================
-- 6. get_project_health(p_project_id)
--    Admin: full response with financial drivers.
--    Member: sanitized (status, progress, delivery status — no budget/margin/cost).
-- ===========================================================================
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

  -- If no state exists yet, return null
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

-- ===========================================================================
-- 7. get_projects_health_summary(p_status_filter)
--    Admin-only overview of all projects with health state.
-- ===========================================================================
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
      COALESCE(phs.health_score, NULL) AS health_score,
      COALESCE(phs.health_status, 'not_applicable') AS health_status,
      COALESCE(phs.progress_percent, public.get_project_progress(p.id)) AS progress_percent,
      phs.budget_utilization,
      phs.forecast_completion_date,
      phs.forecast_labor_cost,
      phs.calculated_at,
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
      AND (p_status_filter IS NULL OR COALESCE(phs.health_status, 'not_applicable') = p_status_filter)
  ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_projects_health_summary(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_projects_health_summary(TEXT) TO authenticated;

-- ===========================================================================
-- 8. get_project_health_history(p_project_id)
--    Returns transition events (admin: full, member: no financial drivers).
-- ===========================================================================
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

-- ===========================================================================
-- 9. Update search_global to include milestones
-- ===========================================================================
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

  -- Milestones (RLS allows all authenticated to see milestones)
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
