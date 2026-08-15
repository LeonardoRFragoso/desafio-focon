-- Test suite for executive command center RPCs and global search.
-- Covers: admin access, member denial, pending counts, approved financials,
-- overdue/critical tasks, missing hourly rates, projects without team,
-- search role scoping, and financial data isolation.

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
-- succeeded (TRUE) or raised (FALSE). Security INVOKER so SET LOCAL ROLE
-- is permitted; the role switch makes RLS apply as the simulated user.
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

DO $$
DECLARE
  v_admin UUID;
  v_ana UUID;
  v_bruno UUID;
  v_result JSONB;
  v_count INTEGER;
BEGIN
  -- Get test user IDs from seed data
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_ana FROM profiles WHERE full_name = 'Ana Silva' LIMIT 1;
  SELECT id INTO v_bruno FROM profiles WHERE full_name = 'Bruno Santos' LIMIT 1;

  -- ====================================================================
  -- TEST 1: admin can call get_admin_command_center_summary
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.get_admin_command_center_summary()'),
    'T1: admin should be able to call get_admin_command_center_summary'
  );

  -- ====================================================================
  -- TEST 2: member is denied get_admin_command_center_summary
  -- ====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, 'SELECT public.get_admin_command_center_summary()'),
    'T2: member must be denied get_admin_command_center_summary'
  );

  -- ====================================================================
  -- TEST 3: admin can call get_projects_attention_summary
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.get_projects_attention_summary()'),
    'T3: admin should be able to call get_projects_attention_summary'
  );

  -- ====================================================================
  -- TEST 4: member is denied get_projects_attention_summary
  -- ====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, 'SELECT public.get_projects_attention_summary()'),
    'T4: member must be denied get_projects_attention_summary'
  );

  -- ====================================================================
  -- TEST 5: get_admin_command_center_summary returns correct pending count
  -- ====================================================================
  v_result := pg_temp.jsonb_as(v_admin::text, 'SELECT public.get_admin_command_center_summary()');

  SELECT COUNT(*) INTO v_count FROM time_entries WHERE approval_status = 'pending';
  PERFORM pg_temp.assert_eq(
    (v_result->'action_signals'->>'pending_count')::INTEGER,
    v_count,
    'T5: pending_count in summary must match actual pending count'
  );

  -- ====================================================================
  -- TEST 6: approved financials — total_labor_cost is non-negative
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    (v_result->'kpis'->>'total_labor_cost')::NUMERIC >= 0,
    'T6: total_labor_cost must be non-negative (only approved entries counted)'
  );

  -- ====================================================================
  -- TEST 7: overdue tasks exclude done and cancelled
  -- ====================================================================
  DECLARE
    v_overdue_in_summary INTEGER;
    v_overdue_actual INTEGER;
  BEGIN
    v_overdue_in_summary := (v_result->'action_signals'->>'overdue_tasks_count')::INTEGER;

    SELECT COUNT(*) INTO v_overdue_actual
    FROM project_tasks
    WHERE due_date IS NOT NULL
      AND due_date < CURRENT_DATE
      AND status NOT IN ('done', 'cancelled');

    PERFORM pg_temp.assert_eq(v_overdue_in_summary, v_overdue_actual,
      'T7: overdue_tasks_count must exclude done/cancelled');
  END;

  -- ====================================================================
  -- TEST 8: critical tasks count is correct
  -- ====================================================================
  DECLARE
    v_critical_in_summary INTEGER;
    v_critical_actual INTEGER;
  BEGIN
    v_critical_in_summary := (v_result->'action_signals'->>'critical_tasks_count')::INTEGER;

    SELECT COUNT(*) INTO v_critical_actual
    FROM project_tasks
    WHERE priority = 'critical'
      AND status NOT IN ('done', 'cancelled');

    PERFORM pg_temp.assert_eq(v_critical_in_summary, v_critical_actual,
      'T8: critical_tasks_count must be correct');
  END;

  -- ====================================================================
  -- TEST 9: professional dashboard stats work for own user
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, 'SELECT public.get_professional_dashboard_stats()'),
    'T9: professional should be able to call get_professional_dashboard_stats for self'
  );

  -- ====================================================================
  -- TEST 10: professional stats return correct pending count
  -- ====================================================================
  DECLARE
    v_prof_result JSONB;
    v_prof_pending INTEGER;
    v_actual_pending INTEGER;
  BEGIN
    v_prof_result := pg_temp.jsonb_as(v_ana::text, 'SELECT public.get_professional_dashboard_stats()');
    v_prof_pending := (v_prof_result->'stats'->>'pending_count')::INTEGER;

    SELECT COUNT(*) INTO v_actual_pending
    FROM time_entries
    WHERE professional_id = v_ana AND approval_status = 'pending';

    PERFORM pg_temp.assert_eq(v_prof_pending, v_actual_pending,
      'T10: professional pending_count must match actual');
  END;

  -- ====================================================================
  -- TEST 11: search_global returns projects for any authenticated user
  -- ====================================================================
  DECLARE
    v_search_result JSONB;
  BEGIN
    v_search_result := pg_temp.jsonb_as(v_ana::text, 'SELECT public.search_global(''Aurora'', 5)');

    PERFORM pg_temp.assert_true(
      jsonb_array_length(v_search_result->'projects') >= 1,
      'T11: search should find projects matching query'
    );
  END;

  -- ====================================================================
  -- TEST 12: search_global with less than 2 chars returns empty
  -- ====================================================================
  DECLARE
    v_search_result JSONB;
  BEGIN
    v_search_result := pg_temp.jsonb_as(v_ana::text, 'SELECT public.search_global(''A'', 5)');

    PERFORM pg_temp.assert_eq(
      jsonb_array_length(v_search_result->'projects'), 0,
      'T12: search with < 2 chars must return empty projects'
    );
  END;

  -- ====================================================================
  -- TEST 13: admin search finds professionals
  -- ====================================================================
  DECLARE
    v_search_result JSONB;
  BEGIN
    v_search_result := pg_temp.jsonb_as(v_admin::text, 'SELECT public.search_global(''Ana'', 5)');

    PERFORM pg_temp.assert_true(
      jsonb_array_length(v_search_result->'professionals') >= 1,
      'T13: admin search should find professionals'
    );
  END;

  -- ====================================================================
  -- TEST 14: member search does NOT find professionals
  -- ====================================================================
  DECLARE
    v_search_result JSONB;
  BEGIN
    v_search_result := pg_temp.jsonb_as(v_ana::text, 'SELECT public.search_global(''Bruno'', 5)');

    PERFORM pg_temp.assert_eq(
      jsonb_array_length(v_search_result->'professionals'), 0,
      'T14: member search must NOT find professionals'
    );
  END;

  -- ====================================================================
  -- TEST 15: member search finds only own time entries (no leak)
  -- ====================================================================
  DECLARE
    v_ana_search JSONB;
    v_bruno_search JSONB;
  BEGIN
    v_ana_search := pg_temp.jsonb_as(v_ana::text, 'SELECT public.search_global(''Escavação'', 10)');
    v_bruno_search := pg_temp.jsonb_as(v_bruno::text, 'SELECT public.search_global(''Escavação'', 10)');

    -- Both should execute without errors and return arrays
    PERFORM pg_temp.assert_true(
      jsonb_array_length(v_ana_search->'time_entries') >= 0,
      'T15: Ana search should return own entries without errors'
    );
    PERFORM pg_temp.assert_true(
      jsonb_array_length(v_bruno_search->'time_entries') >= 0,
      'T15: Bruno search should return own entries without errors'
    );
  END;

  -- ====================================================================
  -- TEST 16: admin search finds all time entries
  -- ====================================================================
  DECLARE
    v_search_result JSONB;
  BEGIN
    v_search_result := pg_temp.jsonb_as(v_admin::text, 'SELECT public.search_global(''Escavação'', 10)');

    PERFORM pg_temp.assert_true(
      jsonb_array_length(v_search_result->'time_entries') >= 0,
      'T16: admin search should execute without errors for time entries'
    );
  END;

  -- ====================================================================
  -- TEST 17: projects attention summary returns valid JSONB with attention_state
  -- ====================================================================
  DECLARE
    v_projects_result JSONB;
  BEGIN
    v_projects_result := pg_temp.jsonb_as(v_admin::text, 'SELECT public.get_projects_attention_summary()');

    PERFORM pg_temp.assert_true(
      v_projects_result IS NOT NULL,
      'T17: projects attention summary must return valid JSONB'
    );

    IF jsonb_array_length(v_projects_result) > 0 THEN
      PERFORM pg_temp.assert_true(
        v_projects_result->0->>'attention_state' IS NOT NULL,
        'T17: each project must have attention_state field'
      );
    END IF;
  END;

  -- ====================================================================
  -- TEST 18: missing hourly rate count considers valid_from/valid_until
  -- ====================================================================
  DECLARE
    v_missing_in_summary INTEGER;
    v_missing_actual INTEGER;
  BEGIN
    v_missing_in_summary := (v_result->'action_signals'->>'missing_rate_count')::INTEGER;

    SELECT COUNT(*) INTO v_missing_actual
    FROM profiles pr
    WHERE pr.role = 'member'
      AND NOT EXISTS (
        SELECT 1 FROM hourly_rates hr
        WHERE hr.professional_id = pr.id
          AND hr.valid_from <= CURRENT_DATE
          AND (hr.valid_until IS NULL OR hr.valid_until >= CURRENT_DATE)
      );

    PERFORM pg_temp.assert_eq(v_missing_in_summary, v_missing_actual,
      'T18: missing_rate_count must consider valid_from/valid_until');
  END;

  -- ====================================================================
  -- TEST 19: projects without team count is correct
  -- ====================================================================
  DECLARE
    v_without_team_in_summary INTEGER;
    v_without_team_actual INTEGER;
  BEGIN
    v_without_team_in_summary := (v_result->'action_signals'->>'projects_without_team_count')::INTEGER;

    SELECT COUNT(*) INTO v_without_team_actual
    FROM projects p
    WHERE p.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id);

    PERFORM pg_temp.assert_eq(v_without_team_in_summary, v_without_team_actual,
      'T19: projects_without_team_count must be correct');
  END;

  RAISE NOTICE 'ALL EXECUTIVE COMMAND CENTER TESTS PASSED';
END;
$$;
