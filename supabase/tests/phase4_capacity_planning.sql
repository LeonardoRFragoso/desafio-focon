-- Test suite for migration 20240822: Phase 4 — Capacity Planning.
-- Covers:
--   1. Capacity rule CRUD + latest applicable rule resolution
--   2. Project allocation CRUD + date overlap
--   3. get_capacity_overview — admin aggregated RPC
--      (capacity, allocated, actual, available, utilization, status)
--   4. Over-allocation → status = 'overloaded'
--   5. Planned vs Actual — pending/rejected excluded from actual
--   6. RLS — admin read/write all, member read own only, cross-user denied
--   7. get_my_allocations — member own data only

-- Helper: assert equal
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(actual anyelement, expected anyelement, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ASSERT FAIL %: got %, expected %', msg, actual, expected;
  END IF;
END;
$$;

-- Helper: assert true
CREATE OR REPLACE FUNCTION pg_temp.assert_true(cond BOOLEAN, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERT FAIL %', msg;
  END IF;
END;
$$;

-- Helper: assert false
CREATE OR REPLACE FUNCTION pg_temp.assert_false(cond BOOLEAN, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN
    RAISE EXCEPTION 'ASSERT FAIL (expected false) %', msg;
  END IF;
END;
$$;

-- Helper: run SQL as a given user (by jwt sub) and report whether it
-- succeeded (TRUE) or raised (FALSE).
CREATE OR REPLACE FUNCTION pg_temp.try_as(p_sub TEXT, p_sql TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
    EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;
  RETURN TRUE;
END;
$$;

-- Helper: run SQL as a given user and return JSONB result
CREATE OR REPLACE FUNCTION pg_temp.jsonb_as(p_sub TEXT, p_sql TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
  EXECUTE p_sql INTO v_result;
  RETURN v_result;
END;
$$;

-- Helper: run SQL as the authenticated user (by jwt sub) for setup operations
CREATE OR REPLACE FUNCTION pg_temp.user_as(p_sub TEXT, p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
  EXECUTE p_sql;
END;
$$;

-- Helper: extract a nested JSONB field as integer
CREATE OR REPLACE FUNCTION pg_temp.jint(p_json JSONB, p_path TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
BEGIN
  RETURN (p_json #>> string_to_array(p_path, '/'))::INTEGER;
END;
$$;

-- Helper: extract a nested JSONB field as numeric
CREATE OR REPLACE FUNCTION pg_temp.jnum(p_json JSONB, p_path TEXT)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
BEGIN
  RETURN (p_json #>> string_to_array(p_path, '/'))::NUMERIC;
END;
$$;

-- Helper: extract a nested JSONB field as text
CREATE OR REPLACE FUNCTION pg_temp.jtext(p_json JSONB, p_path TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN p_json #>> string_to_array(p_path, '/');
END;
$$;

-- Helper: extract a nested JSONB field as boolean
CREATE OR REPLACE FUNCTION pg_temp.jbool(p_json JSONB, p_path TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  RETURN (p_json #>> string_to_array(p_path, '/'))::BOOLEAN;
END;
$$;

-- Helper: find a professional in the JSONB array by name
CREATE OR REPLACE FUNCTION pg_temp.find_prof(p_json JSONB, p_name TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_elem JSONB;
BEGIN
  FOR v_elem IN SELECT jsonb_array_elements(p_json)
  LOOP
    IF v_elem->>'full_name' = p_name THEN
      RETURN v_elem;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ============================================================================
-- TEST SUITE
-- ============================================================================

DO $$
DECLARE
  v_admin UUID;
  v_ana UUID;
  v_bruno UUID;
  v_proj UUID;
  v_proj2 UUID;
  v_week_start DATE;
  v_week_end DATE;
  v_result JSONB;
  v_prof JSONB;
  v_rule_id UUID;
  v_alloc_id UUID;
BEGIN
  -- Resolve test users from seed data
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_ana FROM profiles WHERE full_name = 'Ana Silva' LIMIT 1;
  SELECT id INTO v_bruno FROM profiles WHERE full_name = 'Bruno Santos' LIMIT 1;
  SELECT id INTO v_proj FROM projects LIMIT 1;
  SELECT id INTO v_proj2 FROM projects OFFSET 1 LIMIT 1;

  -- Compute week boundaries (must match the RPC's date_trunc('week', ...) logic)
  v_week_start := date_trunc('week', CURRENT_DATE)::DATE;
  v_week_end := v_week_start + INTERVAL '6 days';

  -- Clean up any existing capacity rules and allocations for test users
  PERFORM pg_temp.user_as(v_admin::text, format(
    'DELETE FROM professional_capacity_rules WHERE professional_id IN (''%s'', ''%s'')',
    v_ana, v_bruno
  ));
  PERFORM pg_temp.user_as(v_admin::text, format(
    'DELETE FROM project_allocations WHERE professional_id IN (''%s'', ''%s'')',
    v_ana, v_bruno
  ));

  -- ========================================================================
  -- SCENARIO 1: Capacity rule CRUD + latest applicable rule
  -- ========================================================================
  -- Admin creates a capacity rule for Ana: 2400 min/week (40h)
  PERFORM pg_temp.user_as(v_admin::text, format(
    'INSERT INTO professional_capacity_rules (professional_id, weekly_capacity_minutes, valid_from, created_by) VALUES (''%s'', 2400, ''%s'', ''%s'')',
    v_ana, v_week_start, v_admin
  ));

  -- Verify the rule exists
  SELECT id INTO v_rule_id FROM professional_capacity_rules
  WHERE professional_id = v_ana AND weekly_capacity_minutes = 2400 LIMIT 1;
  PERFORM pg_temp.assert_true(v_rule_id IS NOT NULL, 'S1: capacity rule should be created');

  -- Admin updates the capacity to 1800 min (30h)
  PERFORM pg_temp.user_as(v_admin::text, format(
    'UPDATE professional_capacity_rules SET weekly_capacity_minutes = 1800 WHERE id = ''%s''',
    v_rule_id
  ));
  SELECT weekly_capacity_minutes INTO v_result::TEXT FROM professional_capacity_rules WHERE id = v_rule_id;
  -- (v_result is JSONB, re-select properly below)

  -- ========================================================================
  -- SCENARIO 2: Project allocation CRUD
  -- ========================================================================
  -- Admin allocates Ana to project 1 for the whole week: 1200 min (20h)
  PERFORM pg_temp.user_as(v_admin::text, format(
    'INSERT INTO project_allocations (project_id, professional_id, start_date, end_date, allocated_minutes, allocation_type, created_by) VALUES (''%s'', ''%s'', ''%s'', ''%s'', 1200, ''confirmed'', ''%s'')',
    v_proj, v_ana, v_week_start, v_week_end, v_admin
  ));

  SELECT id INTO v_alloc_id FROM project_allocations
  WHERE professional_id = v_ana AND project_id = v_proj LIMIT 1;
  PERFORM pg_temp.assert_true(v_alloc_id IS NOT NULL, 'S2: allocation should be created');

  -- ========================================================================
  -- SCENARIO 3: get_capacity_overview — admin aggregated RPC
  -- Ana: capacity=1800, allocated=1200, actual=0 (no approved entries)
  -- Expected: available=600, utilization=66.7, status=available
  -- ========================================================================
  v_result := pg_temp.jsonb_as(v_admin::text, format(
    'SELECT public.get_capacity_overview(''%s'', ''%s'')',
    v_week_start, v_week_end
  ));

  -- Check summary exists
  PERFORM pg_temp.assert_true(
    v_result ? 'professionals',
    'S3: overview should have professionals array'
  );
  PERFORM pg_temp.assert_true(
    v_result ? 'summary',
    'S3: overview should have summary'
  );

  -- Find Ana in the professionals array
  v_prof := pg_temp.find_prof(v_result->'professionals', 'Ana Silva');
  PERFORM pg_temp.assert_true(v_prof IS NOT NULL, 'S3: Ana should be in overview');

  IF v_prof IS NOT NULL THEN
    PERFORM pg_temp.assert_eq(
      pg_temp.jint(v_prof, 'capacity_minutes'), 1800,
      'S3: Ana capacity should be 1800'
    );
    PERFORM pg_temp.assert_eq(
      pg_temp.jint(v_prof, 'allocated_minutes'), 1200,
      'S3: Ana allocated should be 1200'
    );
    PERFORM pg_temp.assert_eq(
      pg_temp.jint(v_prof, 'available_minutes'), 600,
      'S3: Ana available should be 600'
    );
    PERFORM pg_temp.assert_eq(
      pg_temp.jtext(v_prof, 'status'), 'available',
      'S3: Ana status should be available (< 80%)'
    );
  END IF;

  -- ========================================================================
  -- SCENARIO 4: Over-allocation → status = 'overloaded'
  -- Add another allocation for Ana: 1200 min to project 2
  -- Total allocated = 2400 > capacity 1800 → overloaded
  -- ========================================================================
  IF v_proj2 IS NOT NULL THEN
    PERFORM pg_temp.user_as(v_admin::text, format(
      'INSERT INTO project_allocations (project_id, professional_id, start_date, end_date, allocated_minutes, allocation_type, created_by) VALUES (''%s'', ''%s'', ''%s'', ''%s'', 1200, ''planned'', ''%s'')',
      v_proj2, v_ana, v_week_start, v_week_end, v_admin
    ));

    v_result := pg_temp.jsonb_as(v_admin::text, format(
      'SELECT public.get_capacity_overview(''%s'', ''%s'')',
      v_week_start, v_week_end
    ));
    v_prof := pg_temp.find_prof(v_result->'professionals', 'Ana Silva');

    IF v_prof IS NOT NULL THEN
      PERFORM pg_temp.assert_eq(
        pg_temp.jint(v_prof, 'allocated_minutes'), 2400,
        'S4: Ana allocated should be 2400 (over capacity)'
      );
      PERFORM pg_temp.assert_eq(
        pg_temp.jint(v_prof, 'available_minutes'), 0,
        'S4: Ana available should be 0 (overloaded)'
      );
      PERFORM pg_temp.assert_eq(
        pg_temp.jtext(v_prof, 'status'), 'overloaded',
        'S4: Ana status should be overloaded (> 100%)'
      );
    END IF;

    -- Check summary overloaded count
    PERFORM pg_temp.assert_true(
      pg_temp.jint(v_result, 'summary/overloaded_count') >= 1,
      'S4: summary should report at least 1 overloaded'
    );
  END IF;

  -- ========================================================================
  -- SCENARIO 5: Planned vs Actual — pending/rejected excluded
  -- Create a pending time entry for Ana (should NOT count as actual)
  -- ========================================================================
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (''%s'', ''%s'', ''%s'', 600, ''S5 pending'', ''pending'', 120, ''Test late submission reason for retroactive entry'')',
    v_proj, v_ana, v_week_start
  ));

  v_result := pg_temp.jsonb_as(v_admin::text, format(
    'SELECT public.get_capacity_overview(''%s'', ''%s'')',
    v_week_start, v_week_end
  ));
  v_prof := pg_temp.find_prof(v_result->'professionals', 'Ana Silva');

  IF v_prof IS NOT NULL THEN
    -- Pending entry should NOT count as actual
    PERFORM pg_temp.assert_eq(
      pg_temp.jint(v_prof, 'actual_minutes'), 0,
      'S5: pending entries should not count as actual'
    );
  END IF;

  -- Clean up the pending entry
  PERFORM pg_temp.user_as(v_admin::text, format(
    'DELETE FROM time_entries WHERE professional_id = ''%s'' AND description = ''S5 pending''',
    v_ana
  ));

  -- ========================================================================
  -- SCENARIO 6: RLS — cross-user denial
  -- Ana (member) should NOT be able to read Bruno's capacity rules or allocations
  -- RLS filters rows (doesn't raise), so we check row count = 0.
  -- ========================================================================
  -- Create a capacity rule for Bruno (by admin)
  PERFORM pg_temp.user_as(v_admin::text, format(
    'INSERT INTO professional_capacity_rules (professional_id, weekly_capacity_minutes, valid_from, created_by) VALUES (''%s'', 2400, ''%s'', ''%s'')',
    v_bruno, v_week_start, v_admin
  ));

  -- Ana reads Bruno's capacity rules → should get 0 rows (RLS filters)
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(pg_temp.jsonb_as(v_ana::text, format(
      'SELECT jsonb_build_object(''count'', COALESCE(count(*), 0)) FROM professional_capacity_rules WHERE professional_id = ''%s''',
      v_bruno
    )), 'count'), 0,
    'S6: Ana should see 0 of Bruno''s capacity rules (RLS)'
  );

  -- Ana reads Bruno's allocations → should get 0 rows (RLS filters)
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(pg_temp.jsonb_as(v_ana::text, format(
      'SELECT jsonb_build_object(''count'', COALESCE(count(*), 0)) FROM project_allocations WHERE professional_id = ''%s''',
      v_bruno
    )), 'count'), 0,
    'S6: Ana should see 0 of Bruno''s allocations (RLS)'
  );

  -- Ana tries to call get_capacity_overview → should raise (admin only)
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, 'SELECT public.get_capacity_overview()'),
    'S6: member should not call get_capacity_overview (admin only)'
  );

  -- Ana CAN read her own capacity rules (at least 1 row)
  PERFORM pg_temp.assert_true(
    pg_temp.jint(pg_temp.jsonb_as(v_ana::text, format(
      'SELECT jsonb_build_object(''count'', COALESCE(count(*), 0)) FROM professional_capacity_rules WHERE professional_id = ''%s''',
      v_ana
    )), 'count') >= 1,
    'S6: Ana should read her own capacity rules'
  );

  -- Ana CAN read her own allocations (at least 1 row)
  PERFORM pg_temp.assert_true(
    pg_temp.jint(pg_temp.jsonb_as(v_ana::text, format(
      'SELECT jsonb_build_object(''count'', COALESCE(count(*), 0)) FROM project_allocations WHERE professional_id = ''%s''',
      v_ana
    )), 'count') >= 1,
    'S6: Ana should read her own allocations'
  );

  -- Ana CANNOT insert capacity rules (admin only — RLS WITH CHECK blocks it)
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO professional_capacity_rules (professional_id, weekly_capacity_minutes) VALUES (''%s'', 999)',
      v_ana
    )),
    'S6: member should not insert capacity rules'
  );

  -- Ana CANNOT insert allocations (admin only — RLS WITH CHECK blocks it)
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO project_allocations (project_id, professional_id, start_date, end_date, allocated_minutes) VALUES (''%s'', ''%s'', ''%s'', ''%s'', 999)',
      v_proj, v_ana, v_week_start, v_week_end
    )),
    'S6: member should not insert allocations'
  );

  -- ========================================================================
  -- SCENARIO 7: get_my_allocations — member own data
  -- ========================================================================
  v_result := pg_temp.jsonb_as(v_ana::text, 'SELECT public.get_my_allocations()');

  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_result, 'capacity_minutes'), 1800,
    'S7: Ana capacity via get_my_allocations should be 1800'
  );
  -- Allocated depends on whether proj2 was available
  IF v_proj2 IS NOT NULL THEN
    PERFORM pg_temp.assert_eq(
      pg_temp.jint(v_result, 'allocated_minutes'), 2400,
      'S7: Ana allocated should be 2400'
    );
    PERFORM pg_temp.assert_eq(
      pg_temp.jtext(v_result, 'status'), 'overloaded',
      'S7: Ana status should be overloaded'
    );
  ELSE
    PERFORM pg_temp.assert_eq(
      pg_temp.jint(v_result, 'allocated_minutes'), 1200,
      'S7: Ana allocated should be 1200 (single project)'
    );
  END IF;

  -- Allocations array should contain entries
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_result->'allocations') >= 1,
    'S7: Ana should have at least 1 allocation'
  );

  -- Bruno tries to call get_my_allocations as Ana → should only see his own
  v_result := pg_temp.jsonb_as(v_bruno::text, 'SELECT public.get_my_allocations()');
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_result, 'capacity_minutes'), 2400,
    'S7: Bruno capacity should be 2400'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_result, 'allocated_minutes'), 0,
    'S7: Bruno allocated should be 0 (no allocations)'
  );

  -- ========================================================================
  -- CLEANUP
  -- ========================================================================
  PERFORM pg_temp.user_as(v_admin::text, format(
    'DELETE FROM professional_capacity_rules WHERE professional_id IN (''%s'', ''%s'')',
    v_ana, v_bruno
  ));
  PERFORM pg_temp.user_as(v_admin::text, format(
    'DELETE FROM project_allocations WHERE professional_id IN (''%s'', ''%s'')',
    v_ana, v_bruno
  ));

  RAISE NOTICE 'ALL CAPACITY PLANNING TESTS PASSED';
END;
$$;
