-- ===========================================================================
-- Migration 20240822: Phase 4 — Capacity Planning
--
-- Introduces organizational capacity planning, distinct from the personal
-- weekly goal (user_preferences.expected_weekly_minutes). The capacity model
-- answers: "How much time is each professional committed to across projects
-- in a given period, and do they have available capacity?"
--
-- Two new tables:
--   professional_capacity_rules — per-professional weekly capacity with
--                                 validity windows (historical tracking).
--   project_allocations        — planned time commitment of a professional
--                                 to a project over a date range.
--
-- One aggregated RPC:
--   get_capacity_overview(p_start_date, p_end_date)
--     Returns one row per professional with capacity, allocated minutes,
--     actual approved minutes, available minutes, utilization %, and
--     project-level allocation breakdown. Admin-only.
--
--   get_my_allocations()
--     Returns the current user's allocations + capacity for a given period.
--     Member can only query their own data.
--
-- RLS:
--   Admin:  full read/write on both tables.
--   Member: read own rows only (professional_id = auth.uid()).
--           No cross-user access.
--
-- Planned vs Actual:
--   "Actual" = SUM(time_entries.duration_minutes) WHERE approval_status =
--   'approved' AND entry_date within the period. Pending and rejected are
--   excluded from actual (they are not confirmed work).
-- ===========================================================================

-- ============================================================================
-- 1. professional_capacity_rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.professional_capacity_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekly_capacity_minutes INTEGER NOT NULL CHECK (weekly_capacity_minutes > 0),
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Only one active rule per professional at a given point in time.
-- "Active" = valid_from <= date AND (valid_until IS NULL OR valid_until >= date).
-- Enforced via a partial unique index on (professional_id, valid_from) to
-- prevent overlapping starts; the application layer resolves the latest
-- applicable rule by valid_from.
CREATE UNIQUE INDEX IF NOT EXISTS idx_capacity_rules_prof_from
  ON public.professional_capacity_rules (professional_id, valid_from);

CREATE INDEX IF NOT EXISTS idx_capacity_rules_prof
  ON public.professional_capacity_rules (professional_id);

CREATE INDEX IF NOT EXISTS idx_capacity_rules_valid
  ON public.professional_capacity_rules (valid_from, valid_until);

ALTER TABLE public.professional_capacity_rules ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "capacity_rules_admin_all"
  ON public.professional_capacity_rules FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Member: read own capacity rules only
CREATE POLICY "capacity_rules_member_read_own"
  ON public.professional_capacity_rules FOR SELECT
  TO authenticated
  USING (professional_id = auth.uid());

-- ============================================================================
-- 2. project_allocations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.project_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  allocated_minutes INTEGER NOT NULL CHECK (allocated_minutes > 0),
  allocation_type TEXT NOT NULL DEFAULT 'planned'
    CHECK (allocation_type IN ('planned', 'confirmed', 'tentative')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Validate date range
ALTER TABLE public.project_allocations
  ADD CONSTRAINT chk_allocation_dates CHECK (end_date >= start_date);

CREATE INDEX IF NOT EXISTS idx_allocations_project
  ON public.project_allocations (project_id);

CREATE INDEX IF NOT EXISTS idx_allocations_prof
  ON public.project_allocations (professional_id);

CREATE INDEX IF NOT EXISTS idx_allocations_dates
  ON public.project_allocations (start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_allocations_prof_dates
  ON public.project_allocations (professional_id, start_date, end_date);

ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "allocations_admin_all"
  ON public.project_allocations FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Member: read own allocations only (no cross-user)
CREATE POLICY "allocations_member_read_own"
  ON public.project_allocations FOR SELECT
  TO authenticated
  USING (professional_id = auth.uid());

-- ============================================================================
-- 3. RPC: get_capacity_overview (admin-only, aggregated)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_capacity_overview(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_start DATE;
  v_end DATE;
  v_result JSONB;
BEGIN
  -- Authorization: admin only
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Default period: current week (Mon–Sun)
  v_start := COALESCE(p_start_date, date_trunc('week', CURRENT_DATE)::DATE);
  v_end := COALESCE(p_end_date, (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE);

  IF v_end < v_start THEN
    RAISE EXCEPTION 'Invalid period: end_date must be >= start_date';
  END IF;

  -- Build per-professional overview in a single query.
  -- Capacity = latest applicable rule (valid_from <= v_start, valid_until
  --            IS NULL OR >= v_start). If no rule, capacity is NULL.
  -- Allocated = SUM(allocated_minutes) of allocations overlapping the period,
  --             prorated by the overlap fraction (so a 4-week allocation
  --             contributes 1/4 of its minutes to a 1-week period).
  -- Actual = SUM(duration_minutes) of approved time_entries in the period.
  -- Available = capacity - allocated (NULL if no capacity rule).
  -- Utilization = allocated / capacity * 100 (NULL if no capacity).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'professional_id', p.id,
    'full_name', p.full_name,
    'role', p.role,
    'capacity_minutes', cap.weekly_capacity_minutes,
    'allocated_minutes', COALESCE(alloc.allocated, 0),
    'actual_minutes', COALESCE(actual.approved, 0),
    'available_minutes',
      CASE WHEN cap.weekly_capacity_minutes IS NOT NULL
           THEN GREATEST(cap.weekly_capacity_minutes - COALESCE(alloc.allocated, 0), 0)
           ELSE NULL
      END,
    'utilization_percent',
      CASE WHEN cap.weekly_capacity_minutes IS NOT NULL AND cap.weekly_capacity_minutes > 0
           THEN LEAST(ROUND((COALESCE(alloc.allocated, 0)::NUMERIC / cap.weekly_capacity_minutes) * 100, 1), 999.9)
           ELSE NULL
      END,
    'status',
      CASE
        WHEN cap.weekly_capacity_minutes IS NULL THEN 'no_capacity'
        WHEN COALESCE(alloc.allocated, 0) > cap.weekly_capacity_minutes THEN 'overloaded'
        WHEN COALESCE(alloc.allocated, 0) >= cap.weekly_capacity_minutes * 0.8 THEN 'well_allocated'
        ELSE 'available'
      END,
    'projects', COALESCE(alloc.projects, '[]'::jsonb)
  ) ORDER BY p.full_name), '[]'::jsonb) INTO v_result
  FROM public.profiles p
  LEFT JOIN LATERAL (
    -- Latest applicable capacity rule as of v_start
    SELECT cr.weekly_capacity_minutes
    FROM public.professional_capacity_rules cr
    WHERE cr.professional_id = p.id
      AND cr.valid_from <= v_start
      AND (cr.valid_until IS NULL OR cr.valid_until >= v_start)
    ORDER BY cr.valid_from DESC
    LIMIT 1
  ) cap ON TRUE
  LEFT JOIN LATERAL (
    -- Allocations overlapping the period, prorated by overlap fraction.
    -- Proration: per-row (overlap_days / allocation_total_days * allocated_minutes),
    -- then summed across all overlapping allocations.
    SELECT
      COALESCE(SUM(
        (LEAST(a.end_date, v_end) - GREATEST(a.start_date, v_start) + 1)::NUMERIC
        / NULLIF(GREATEST(a.end_date - a.start_date + 1, 1), 0)
        * a.allocated_minutes
      ), 0)::INTEGER AS allocated,
      -- Project breakdown (non-prorated raw minutes for display)
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'project_id', a2.project_id,
          'project_name', proj.name,
          'allocated_minutes', a2.allocated_minutes,
          'start_date', a2.start_date,
          'end_date', a2.end_date,
          'allocation_type', a2.allocation_type
        ) ORDER BY proj.name), '[]'::jsonb)
        FROM public.project_allocations a2
        JOIN public.projects proj ON proj.id = a2.project_id
        WHERE a2.professional_id = p.id
          AND a2.start_date <= v_end
          AND a2.end_date >= v_start
      ) AS projects
    FROM public.project_allocations a
    WHERE a.professional_id = p.id
      AND a.start_date <= v_end
      AND a.end_date >= v_start
  ) alloc ON TRUE
  LEFT JOIN LATERAL (
    -- Actual approved minutes in the period
    SELECT COALESCE(SUM(te.duration_minutes), 0)::INTEGER AS approved
    FROM public.time_entries te
    WHERE te.professional_id = p.id
      AND te.approval_status = 'approved'
      AND te.entry_date >= v_start
      AND te.entry_date <= v_end
  ) actual ON TRUE
  WHERE p.role = 'member';

  v_result := jsonb_build_object(
    'period', jsonb_build_object('start_date', v_start, 'end_date', v_end),
    'professionals', v_result,
    'summary', jsonb_build_object(
      'total_professionals', jsonb_array_length(v_result),
      'overloaded_count',
        (SELECT COUNT(*) FROM jsonb_array_elements(v_result) e
         WHERE e->>'status' = 'overloaded'),
      'well_allocated_count',
        (SELECT COUNT(*) FROM jsonb_array_elements(v_result) e
         WHERE e->>'status' = 'well_allocated'),
      'available_count',
        (SELECT COUNT(*) FROM jsonb_array_elements(v_result) e
         WHERE e->>'status' = 'available'),
      'no_capacity_count',
        (SELECT COUNT(*) FROM jsonb_array_elements(v_result) e
         WHERE e->>'status' = 'no_capacity')
    )
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_capacity_overview(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_capacity_overview(DATE, DATE) TO authenticated;

-- ============================================================================
-- 4. RPC: get_my_allocations (member, own data only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_allocations(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_start DATE;
  v_end DATE;
  v_result JSONB;
  v_capacity INTEGER;
  v_allocated INTEGER;
  v_actual INTEGER;
  v_allocations JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_start := COALESCE(p_start_date, date_trunc('week', CURRENT_DATE)::DATE);
  v_end := COALESCE(p_end_date, (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE);

  IF v_end < v_start THEN
    RAISE EXCEPTION 'Invalid period: end_date must be >= start_date';
  END IF;

  -- Capacity (latest applicable rule)
  SELECT cr.weekly_capacity_minutes INTO v_capacity
  FROM public.professional_capacity_rules cr
  WHERE cr.professional_id = v_user_id
    AND cr.valid_from <= v_start
    AND (cr.valid_until IS NULL OR cr.valid_until >= v_start)
  ORDER BY cr.valid_from DESC
  LIMIT 1;

  -- Allocations for the period
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'project_id', a.project_id,
    'project_name', proj.name,
    'start_date', a.start_date,
    'end_date', a.end_date,
    'allocated_minutes', a.allocated_minutes,
    'allocation_type', a.allocation_type,
    'notes', a.notes
  ) ORDER BY a.start_date), '[]'::jsonb) INTO v_allocations
  FROM public.project_allocations a
  JOIN public.projects proj ON proj.id = a.project_id
  WHERE a.professional_id = v_user_id
    AND a.start_date <= v_end
    AND a.end_date >= v_start;

  -- Prorated allocated total (per-row proration, then summed)
  SELECT COALESCE(SUM(
    (LEAST(a.end_date, v_end) - GREATEST(a.start_date, v_start) + 1)::NUMERIC
    / NULLIF(GREATEST(a.end_date - a.start_date + 1, 1), 0)
    * a.allocated_minutes
  ), 0)::INTEGER INTO v_allocated
  FROM public.project_allocations a
  WHERE a.professional_id = v_user_id
    AND a.start_date <= v_end
    AND a.end_date >= v_start;

  -- Actual approved minutes
  SELECT COALESCE(SUM(te.duration_minutes), 0)::INTEGER INTO v_actual
  FROM public.time_entries te
  WHERE te.professional_id = v_user_id
    AND te.approval_status = 'approved'
    AND te.entry_date >= v_start
    AND te.entry_date <= v_end;

  v_result := jsonb_build_object(
    'period', jsonb_build_object('start_date', v_start, 'end_date', v_end),
    'capacity_minutes', v_capacity,
    'allocated_minutes', v_allocated,
    'actual_minutes', v_actual,
    'available_minutes',
      CASE WHEN v_capacity IS NOT NULL
           THEN GREATEST(v_capacity - v_allocated, 0)
           ELSE NULL
      END,
    'utilization_percent',
      CASE WHEN v_capacity IS NOT NULL AND v_capacity > 0
           THEN LEAST(ROUND((v_allocated::NUMERIC / v_capacity) * 100, 1), 999.9)
           ELSE NULL
      END,
    'status',
      CASE
        WHEN v_capacity IS NULL THEN 'no_capacity'
        WHEN v_allocated > v_capacity THEN 'overloaded'
        WHEN v_allocated >= v_capacity * 0.8 THEN 'well_allocated'
        ELSE 'available'
      END,
    'allocations', v_allocations
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_allocations(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_allocations(DATE, DATE) TO authenticated;

-- ============================================================================
-- 5. updated_at trigger (reuse existing pattern)
-- ============================================================================

-- Trigger function already exists from earlier migrations (touch_updated_at).
-- Apply to new tables.
CREATE TRIGGER trg_capacity_rules_updated_at
  BEFORE UPDATE ON public.professional_capacity_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_project_allocations_updated_at
  BEFORE UPDATE ON public.project_allocations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 6. Grants (table-level access for authenticated role)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.professional_capacity_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_allocations TO authenticated;
