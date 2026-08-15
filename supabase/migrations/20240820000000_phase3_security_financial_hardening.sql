-- ===========================================================================
-- Phase 3.1: Security, Financial, and Production Hardening
-- ===========================================================================
-- This migration fixes issues identified in the post-merge review of Phase 3:
--
-- 1. SECURITY: get_project_realized_labor_cost was EXECUTE-granted to all
--    authenticated users. Members could query financial data directly.
--    Fix: Revoke from authenticated, grant only to admin role via is_admin check.
--
-- 2. FINANCIAL: get_admin_command_center_summary computed result as
--    revenue - labor_cost, ignoring tax and indirect_cost.
--    Fix: Use the existing calculate_result/calculate_tax functions for
--    consistency with the rest of the system.
--
-- 3. AUTHORIZATION: get_professional_dashboard_stats accepted an arbitrary
--    p_user_id, allowing members to query other professionals' data.
--    Fix: Validate that non-admins can only query their own auth.uid().
--
-- 4. SEARCH: search_global returned all tasks to members regardless of
--    assignment. Fix: Filter tasks by assignee_id for non-admins.
--
-- All changes are additive/incremental. No data is modified or deleted.
-- ===========================================================================

-- ===========================================================================
-- 1. SECURITY: Restrict get_project_realized_labor_cost to admin-only
-- ===========================================================================
-- Revoke EXECUTE from all authenticated users.
-- Only admin RPCs (which are SECURITY DEFINER) call this internally.
-- Direct calls by members must be denied.

REVOKE EXECUTE ON FUNCTION public.get_project_realized_labor_cost(UUID, DATE, DATE) FROM authenticated;

-- Create an explicit admin-only wrapper for cases where direct call is needed
-- by admin UI. This validates is_admin() at runtime.
CREATE OR REPLACE FUNCTION public.get_project_realized_labor_cost_admin(
  p_project_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS NUMERIC
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
  RETURN public.get_project_realized_labor_cost(p_project_id, p_start_date, p_end_date);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_project_realized_labor_cost_admin(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_realized_labor_cost_admin(UUID, DATE, DATE) TO authenticated;

-- ===========================================================================
-- 2. FINANCIAL: Fix get_admin_command_center_summary to use correct formula
-- ===========================================================================
-- result = contracted_revenue - labor_cost - tax - indirect_cost
-- margin = result / contracted_revenue * 100 (when revenue > 0)
--
-- Also separates "contracted" (total) from "period" (filtered) values:
-- - total_revenue, total_tax, total_indirect_cost, total_labor_cost are
--   CONTRACTUAL totals (all active/completed projects, not period-scoped)
-- - approved_hours_period is period-scoped (operational KPI)
-- - labor_cost is now also contractual total for consistency with revenue

CREATE OR REPLACE FUNCTION public.get_admin_command_center_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_result JSONB;
  v_pending_count INTEGER;
  v_old_pending_count INTEGER;
  v_old_pending_threshold DATE := CURRENT_DATE - INTERVAL '3 days';
  v_rejected_recent_count INTEGER;
  v_rejected_since DATE := CURRENT_DATE - INTERVAL '7 days';
  v_active_projects_count INTEGER;
  v_open_tasks_count INTEGER;
  v_overdue_tasks_count INTEGER;
  v_critical_tasks_count INTEGER;
  v_missing_rate_count INTEGER;
  v_projects_without_team_count INTEGER;
  v_unack_alerts_count INTEGER;
  v_overbudget_projects JSONB;
  v_approved_hours_period INTEGER;
  v_pending_approvals JSONB;
  v_total_revenue NUMERIC;
  v_total_tax NUMERIC;
  v_total_indirect_cost NUMERIC;
  v_total_labor_cost NUMERIC;
  v_total_result NUMERIC;
  v_total_margin NUMERIC;
  v_team_summary JSONB;
BEGIN
  -- Verify admin
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Default period: last 30 days
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  -- ---- Action signals ----

  SELECT COUNT(*) INTO v_pending_count
  FROM time_entries WHERE approval_status = 'pending';

  SELECT COUNT(*) INTO v_old_pending_count
  FROM time_entries
  WHERE approval_status = 'pending'
    AND created_at < v_old_pending_threshold;

  SELECT COUNT(*) INTO v_rejected_recent_count
  FROM time_entries
  WHERE approval_status = 'rejected'
    AND rejected_at >= v_rejected_since;

  -- D. Projects over budget
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'project_id', p.id,
    'project_name', p.name,
    'client', p.client,
    'budget_value', pb.budget_value,
    'realized_cost', public.get_project_realized_labor_cost(p.id, NULL, NULL),
    'utilization_percent',
      CASE WHEN pb.budget_value > 0 THEN
        ROUND((public.get_project_realized_labor_cost(p.id, NULL, NULL) / pb.budget_value) * 100, 2)
      ELSE 0 END
  ) ORDER BY p.name), '[]'::jsonb) INTO v_overbudget_projects
  FROM projects p
  JOIN project_budgets pb ON pb.project_id = p.id
    AND pb.budget_type = 'labor_cost'
  WHERE p.status IN ('active', 'planned')
    AND pb.budget_value > 0
    AND public.get_project_realized_labor_cost(p.id, NULL, NULL) / pb.budget_value >= 0.85;

  SELECT COUNT(*) INTO v_unack_alerts_count
  FROM profitability_alerts
  WHERE acknowledged_by IS NULL;

  SELECT COUNT(*) INTO v_overdue_tasks_count
  FROM project_tasks
  WHERE due_date IS NOT NULL
    AND due_date < CURRENT_DATE
    AND status NOT IN ('done', 'cancelled');

  SELECT COUNT(*) INTO v_critical_tasks_count
  FROM project_tasks
  WHERE priority = 'critical'
    AND status NOT IN ('done', 'cancelled');

  SELECT COUNT(*) INTO v_missing_rate_count
  FROM profiles pr
  WHERE pr.role = 'member'
    AND NOT EXISTS (
      SELECT 1 FROM hourly_rates hr
      WHERE hr.professional_id = pr.id
        AND hr.valid_from <= CURRENT_DATE
        AND (hr.valid_until IS NULL OR hr.valid_until >= CURRENT_DATE)
    );

  SELECT COUNT(*) INTO v_projects_without_team_count
  FROM projects p
  WHERE p.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id);

  -- ---- KPIs ----

  SELECT COUNT(*) INTO v_active_projects_count
  FROM projects WHERE status = 'active';

  SELECT COUNT(*) INTO v_open_tasks_count
  FROM project_tasks WHERE status NOT IN ('done', 'cancelled');

  -- Approved hours in period (operational KPI — period-scoped)
  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_approved_hours_period
  FROM time_entries
  WHERE approval_status = 'approved'
    AND entry_date >= p_start_date
    AND entry_date <= p_end_date;

  -- Financial totals (CONTRACTUAL — not period-scoped)
  -- Uses existing calculate_* functions for consistency with financial reports
  SELECT
    COALESCE(SUM(pf.contracted_revenue), 0),
    COALESCE(SUM(public.calculate_tax(pf.project_id)), 0),
    COALESCE(SUM(pf.indirect_cost), 0),
    COALESCE(SUM(public.get_project_realized_labor_cost(pf.project_id, NULL, NULL)), 0)
  INTO v_total_revenue, v_total_tax, v_total_indirect_cost, v_total_labor_cost
  FROM project_financials pf
  JOIN projects p ON p.id = pf.project_id
  WHERE p.status IN ('active', 'completed');

  -- Correct formula: result = revenue - labor_cost - tax - indirect_cost
  v_total_result := v_total_revenue - v_total_labor_cost - v_total_tax - v_total_indirect_cost;
  v_total_margin := CASE WHEN v_total_revenue > 0 THEN
    ROUND((v_total_result / v_total_revenue) * 100, 2) ELSE 0 END;

  -- Team summary (hours per professional in period — operational)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'professional_id', prof_id,
    'full_name', prof_name,
    'approved_hours', approved_min,
    'entry_count', entry_cnt
  ) ORDER BY approved_min DESC), '[]'::jsonb) INTO v_team_summary
  FROM (
    SELECT
      te.professional_id AS prof_id,
      pr.full_name AS prof_name,
      SUM(te.duration_minutes) AS approved_min,
      COUNT(*) AS entry_cnt
    FROM time_entries te
    JOIN profiles pr ON pr.id = te.professional_id
    WHERE te.approval_status = 'approved'
      AND te.entry_date >= p_start_date
      AND te.entry_date <= p_end_date
    GROUP BY te.professional_id, pr.full_name
  ) sub;

  -- Pending approvals (5 oldest)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', te.id,
    'professional_name', pr.full_name,
    'project_name', proj.name,
    'entry_date', te.entry_date,
    'duration_minutes', te.duration_minutes,
    'description', te.description,
    'created_at', te.created_at
  ) ORDER BY te.created_at ASC), '[]'::jsonb) INTO v_pending_approvals
  FROM (
    SELECT te.id, te.professional_id, te.project_id, te.entry_date,
           te.duration_minutes, te.description, te.created_at
    FROM time_entries te
    WHERE te.approval_status = 'pending'
    ORDER BY te.created_at ASC
    LIMIT 5
  ) te
  JOIN profiles pr ON pr.id = te.professional_id
  JOIN projects proj ON proj.id = te.project_id;

  v_result := jsonb_build_object(
    'period', jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date),
    'action_signals', jsonb_build_object(
      'pending_count', v_pending_count,
      'old_pending_count', v_old_pending_count,
      'old_pending_threshold_days', 3,
      'rejected_recent_count', v_rejected_recent_count,
      'overbudget_projects', v_overbudget_projects,
      'unack_alerts_count', v_unack_alerts_count,
      'overdue_tasks_count', v_overdue_tasks_count,
      'critical_tasks_count', v_critical_tasks_count,
      'missing_rate_count', v_missing_rate_count,
      'projects_without_team_count', v_projects_without_team_count
    ),
    'kpis', jsonb_build_object(
      'total_revenue', v_total_revenue,
      'total_tax', v_total_tax,
      'total_indirect_cost', v_total_indirect_cost,
      'total_labor_cost', v_total_labor_cost,
      'total_result', v_total_result,
      'total_margin', v_total_margin,
      'approved_hours_period', v_approved_hours_period,
      'active_projects', v_active_projects_count,
      'pending_approvals', v_pending_count,
      'open_tasks', v_open_tasks_count,
      'overdue_tasks', v_overdue_tasks_count
    ),
    'team_summary', v_team_summary,
    'pending_approvals', v_pending_approvals
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_command_center_summary(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_command_center_summary(DATE, DATE) TO authenticated;

-- ===========================================================================
-- 3. AUTHORIZATION: get_professional_dashboard_stats — enforce own-user rule
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_professional_dashboard_stats(
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_result JSONB;
  v_pending_count INTEGER;
  v_approved_count INTEGER;
  v_rejected_count INTEGER;
  v_approved_minutes INTEGER;
  v_rejected_entries JSONB;
  v_my_tasks JSONB;
  v_overdue_tasks_count INTEGER;
  v_critical_tasks_count INTEGER;
  v_due_soon_tasks_count INTEGER;
  v_unread_notifications_count INTEGER;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Authorization: non-admins can only query their own stats
  IF v_user_id != auth.uid() THEN
    SELECT public.is_admin(auth.uid()) INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Access denied: can only query own dashboard stats';
    END IF;
  END IF;

  -- Counts + hours in a single query
  SELECT
    COUNT(*) FILTER (WHERE approval_status = 'pending'),
    COUNT(*) FILTER (WHERE approval_status = 'approved'),
    COUNT(*) FILTER (WHERE approval_status = 'rejected'),
    COALESCE(SUM(duration_minutes) FILTER (WHERE approval_status = 'approved'), 0)
  INTO v_pending_count, v_approved_count, v_rejected_count, v_approved_minutes
  FROM time_entries WHERE professional_id = v_user_id;

  -- Rejected entries needing correction
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', te.id,
    'project_name', proj.name,
    'entry_date', te.entry_date,
    'duration_minutes', te.duration_minutes,
    'rejection_reason', te.rejection_reason,
    'rejected_at', te.rejected_at
  ) ORDER BY te.rejected_at DESC), '[]'::jsonb) INTO v_rejected_entries
  FROM (
    SELECT te.id, te.project_id, te.entry_date, te.duration_minutes, te.rejection_reason, te.rejected_at
    FROM time_entries te
    WHERE te.professional_id = v_user_id
      AND te.approval_status = 'rejected'
    ORDER BY te.rejected_at DESC
    LIMIT 5
  ) te
  JOIN projects proj ON proj.id = te.project_id;

  -- My tasks: assigned, not done/cancelled, ordered by priority + due date
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pt.id,
    'project_id', pt.project_id,
    'project_name', proj.name,
    'phase_name', ph.name,
    'title', pt.title,
    'priority', pt.priority,
    'status', pt.status,
    'due_date', pt.due_date
  ) ORDER BY
    CASE pt.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    CASE WHEN pt.due_date IS NOT NULL AND pt.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
    pt.due_date NULLS LAST), '[]'::jsonb) INTO v_my_tasks
  FROM (
    SELECT pt.id, pt.project_id, pt.phase_id, pt.title, pt.priority, pt.status, pt.due_date
    FROM project_tasks pt
    WHERE pt.assignee_id = v_user_id
      AND pt.status NOT IN ('done', 'cancelled')
    ORDER BY
      CASE pt.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      CASE WHEN pt.due_date IS NOT NULL AND pt.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
      pt.due_date NULLS LAST
    LIMIT 8
  ) pt
  JOIN projects proj ON proj.id = pt.project_id
  LEFT JOIN project_phases ph ON ph.id = pt.phase_id;

  -- Task counts
  SELECT
    COUNT(*) FILTER (WHERE pt.due_date IS NOT NULL AND pt.due_date < CURRENT_DATE),
    COUNT(*) FILTER (WHERE pt.priority = 'critical'),
    COUNT(*) FILTER (WHERE pt.due_date IS NOT NULL AND pt.due_date >= CURRENT_DATE AND pt.due_date <= CURRENT_DATE + INTERVAL '7 days')
  INTO v_overdue_tasks_count, v_critical_tasks_count, v_due_soon_tasks_count
  FROM project_tasks pt
  WHERE pt.assignee_id = v_user_id
    AND pt.status NOT IN ('done', 'cancelled');

  -- Unread notifications
  SELECT COUNT(*) INTO v_unread_notifications_count
  FROM notifications
  WHERE user_id = v_user_id AND read_at IS NULL;

  v_result := jsonb_build_object(
    'stats', jsonb_build_object(
      'pending_count', v_pending_count,
      'approved_count', v_approved_count,
      'rejected_count', v_rejected_count,
      'approved_minutes', v_approved_minutes
    ),
    'rejected_entries', v_rejected_entries,
    'my_tasks', v_my_tasks,
    'task_counts', jsonb_build_object(
      'overdue', v_overdue_tasks_count,
      'critical', v_critical_tasks_count,
      'due_soon', v_due_soon_tasks_count
    ),
    'unread_notifications', v_unread_notifications_count
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_professional_dashboard_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professional_dashboard_stats(UUID) TO authenticated;

-- ===========================================================================
-- 4. SEARCH: Restrict task search for members to assigned tasks only
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
  v_professionals JSONB;
  v_time_entries JSONB;
  v_effective_limit INTEGER := LEAST(p_limit, 20);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object('projects', '[]'::jsonb, 'tasks', '[]'::jsonb, 'professionals', '[]'::jsonb, 'time_entries', '[]'::jsonb);
  END IF;

  SELECT public.is_admin(v_user_id) INTO v_is_admin;

  -- Projects (RLS allows all authenticated to see projects)
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

  -- Tasks: admins see all, members see only tasks assigned to them
  IF v_is_admin THEN
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
  ELSE
    -- Members: only tasks assigned to them
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
        AND pt.assignee_id = v_user_id
      ORDER BY pt.title
      LIMIT v_effective_limit
    ) pt
    JOIN projects proj ON proj.id = pt.project_id;
  END IF;

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

  -- Time entries: admins see all, members see only own
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
    'professionals', v_professionals,
    'time_entries', v_time_entries
  );

  RETURN v_results;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_global(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_global(TEXT, INTEGER) TO authenticated;
