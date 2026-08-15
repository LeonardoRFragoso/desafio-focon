-- ===========================================================================
-- Migration 20240821: Professional weekly goal consistency
--
-- Extends get_professional_dashboard_stats to return a unified `weekly_goal`
-- block that both HourGoalWidget and ProfessionalActionCenter consume, so the
-- two components share a single source of truth.
--
-- Rules enforced server-side (and mirrored on the client):
--   * Goal source = user_preferences.expected_weekly_minutes (no hardcoded 40h).
--   * If no preference is set, `configured` = false and goal_minutes is null.
--   * Week = Monday 00:00 -> Sunday 23:59:59 of the CURRENT week, computed in
--     the database timezone (the product stores entry_date as DATE, so the
--     boundary is day-granularity and timezone-agnostic for the comparison).
--   * registered_minutes = approved + pending (rejected excluded from progress).
--   * progress_percent = null when goal is not configured (no fake percentage).
--   * remaining_minutes = max(goal - registered, 0) when configured, else null.
--
-- The function is replaced (CREATE OR REPLACE) so existing callers keep
-- working; the new `weekly_goal` key is additive.
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
  v_week_start DATE;
  v_week_end DATE;
  v_goal_minutes INTEGER;
  v_goal_pref JSONB;
  v_weekly_approved INTEGER;
  v_weekly_pending INTEGER;
  v_weekly_rejected INTEGER;
  v_weekly_registered INTEGER;
  v_weekly_remaining INTEGER;
  v_weekly_progress NUMERIC;
  v_weekly_goal JSONB;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Authorization: non-admins can only query their own stats.
  -- (Preserved from migration 20240820; must not be dropped by this migration.)
  IF v_user_id != auth.uid() THEN
    SELECT public.is_admin(auth.uid()) INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Access denied: can only query own dashboard stats';
    END IF;
  END IF;

  -- Counts + hours in a single query (all-time totals, unchanged)
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

  -- ========================================================================
  -- Weekly goal aggregation (single source of truth)
  -- ========================================================================
  -- Current week: Monday 00:00 -> Sunday 23:59:59.
  -- date_trunc('week', ...) in PostgreSQL returns the Monday of the week
  -- (ISO weeks, week starts on Monday).
  v_week_start := date_trunc('week', CURRENT_DATE)::DATE;
  v_week_end := v_week_start + INTERVAL '6 days';

  -- Goal preference (single source of truth; no hardcoded fallback).
  SELECT pref_value INTO v_goal_pref
  FROM user_preferences
  WHERE user_id = v_user_id AND pref_key = 'expected_weekly_minutes';

  v_goal_minutes := NULL;
  IF v_goal_pref IS NOT NULL THEN
    v_goal_minutes := (v_goal_pref->>'minutes')::INTEGER;
    -- Treat invalid (<=0) or NULL values as "not configured"
    IF v_goal_minutes IS NULL OR v_goal_minutes <= 0 THEN
      v_goal_minutes := NULL;
    END IF;
  END IF;

  -- Weekly breakdown by status (current week only, by entry_date).
  SELECT
    COALESCE(SUM(duration_minutes) FILTER (WHERE approval_status = 'approved'), 0),
    COALESCE(SUM(duration_minutes) FILTER (WHERE approval_status = 'pending'), 0),
    COALESCE(SUM(duration_minutes) FILTER (WHERE approval_status = 'rejected'), 0)
  INTO v_weekly_approved, v_weekly_pending, v_weekly_rejected
  FROM time_entries
  WHERE professional_id = v_user_id
    AND entry_date >= v_week_start
    AND entry_date <= v_week_end;

  -- registered = approved + pending (rejected excluded from progress)
  v_weekly_registered := v_weekly_approved + v_weekly_pending;

  IF v_goal_minutes IS NOT NULL THEN
    v_weekly_remaining := GREATEST(v_goal_minutes - v_weekly_registered, 0);
    v_weekly_progress := LEAST((v_weekly_registered::NUMERIC / v_goal_minutes::NUMERIC) * 100, 100);
    v_weekly_goal := jsonb_build_object(
      'configured', TRUE,
      'goal_minutes', v_goal_minutes,
      'approved_minutes', v_weekly_approved,
      'pending_minutes', v_weekly_pending,
      'rejected_minutes', v_weekly_rejected,
      'registered_minutes', v_weekly_registered,
      'remaining_minutes', v_weekly_remaining,
      'progress_percent', v_weekly_progress,
      'week_start', v_week_start,
      'week_end', v_week_end
    );
  ELSE
    v_weekly_goal := jsonb_build_object(
      'configured', FALSE,
      'goal_minutes', NULL,
      'approved_minutes', v_weekly_approved,
      'pending_minutes', v_weekly_pending,
      'rejected_minutes', v_weekly_rejected,
      'registered_minutes', v_weekly_registered,
      'remaining_minutes', NULL,
      'progress_percent', NULL,
      'week_start', v_week_start,
      'week_end', v_week_end
    );
  END IF;

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
    'unread_notifications', v_unread_notifications_count,
    'weekly_goal', v_weekly_goal
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_professional_dashboard_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professional_dashboard_stats(UUID) TO authenticated;
