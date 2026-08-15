-- Test suite for Phase 3.1 Security & Financial Hardening.
-- Covers: financial helper access control, professional stats authorization,
-- search isolation, and financial formula correctness.

-- Helper: assert equal
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(actual anyelement, expected anyelement, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ASSERT FAIL %: got %, expected %', msg, actual, expected;
  END IF;
END;
$func$;

-- Helper: assert true
CREATE OR REPLACE FUNCTION pg_temp.assert_true(cond BOOLEAN, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERT FAIL %', msg;
  END IF;
END;
$func$;

-- Helper: assert false
CREATE OR REPLACE FUNCTION pg_temp.assert_false(cond BOOLEAN, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  IF cond THEN
    RAISE EXCEPTION 'ASSERT FAIL (expected false) %', msg;
  END IF;
END;
$func$;

-- Helper: run SQL as a given user (by jwt sub) and report whether it
-- succeeded (TRUE) or raised (FALSE).
CREATE OR REPLACE FUNCTION pg_temp.try_as(p_sub TEXT, p_sql TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $func$
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
$func$;

-- Helper: run SQL as a given user and return JSONB result
CREATE OR REPLACE FUNCTION pg_temp.jsonb_as(p_sub TEXT, p_sql TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $func$
DECLARE
  v_result JSONB;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
  EXECUTE p_sql INTO v_result;
  RETURN v_result;
END;
$func$;

DO $test$
DECLARE
  v_admin UUID;
  v_ana UUID;
  v_bruno UUID;
  v_project_id UUID;
  v_kpis JSONB;
  v_revenue NUMERIC;
  v_labor NUMERIC;
  v_tax NUMERIC;
  v_indirect NUMERIC;
  v_result NUMERIC;
  v_expected_result NUMERIC;
  v_margin NUMERIC;
  v_expected_margin NUMERIC;
  v_search JSONB;
BEGIN
  -- Get test user IDs from seed data
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_ana FROM profiles WHERE full_name = 'Ana Silva' LIMIT 1;
  SELECT id INTO v_bruno FROM profiles WHERE full_name = 'Bruno Santos' LIMIT 1;
  SELECT id INTO v_project_id FROM projects LIMIT 1;

  -- =====================================================================
  -- TEST 1: get_project_realized_labor_cost_admin function exists
  -- =====================================================================
  PERFORM pg_temp.assert_true(
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_project_realized_labor_cost_admin'),
    'T1: get_project_realized_labor_cost_admin function exists'
  );

  -- =====================================================================
  -- TEST 2: get_project_realized_labor_cost still exists (not dropped)
  -- =====================================================================
  PERFORM pg_temp.assert_true(
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_project_realized_labor_cost'),
    'T2: get_project_realized_labor_cost function still exists'
  );

  -- =====================================================================
  -- TEST 3: Member CANNOT call get_project_realized_labor_cost directly
  -- (EXECUTE was revoked from authenticated)
  -- =====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format('SELECT public.get_project_realized_labor_cost(''%s''::uuid, NULL, NULL)', v_project_id)),
    'T3: member cannot call get_project_realized_labor_cost directly (EXECUTE revoked)'
  );

  -- =====================================================================
  -- TEST 4: Admin CAN call get_project_realized_labor_cost_admin
  -- =====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.get_project_realized_labor_cost_admin(''%s''::uuid, NULL, NULL)', v_project_id)),
    'T4: admin can call get_project_realized_labor_cost_admin'
  );

  -- =====================================================================
  -- TEST 5: Member CANNOT call get_project_realized_labor_cost_admin
  -- =====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format('SELECT public.get_project_realized_labor_cost_admin(''%s''::uuid, NULL, NULL)', v_project_id)),
    'T5: member cannot call get_project_realized_labor_cost_admin'
  );

  -- =====================================================================
  -- TEST 6: Admin can call get_admin_command_center_summary
  -- =====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.get_admin_command_center_summary()'),
    'T6: admin can call get_admin_command_center_summary'
  );

  -- =====================================================================
  -- TEST 7: Member is denied get_admin_command_center_summary
  -- =====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, 'SELECT public.get_admin_command_center_summary()'),
    'T7: member is denied get_admin_command_center_summary'
  );

  -- =====================================================================
  -- TEST 8: KPIs include total_tax field
  -- =====================================================================
  v_kpis := pg_temp.jsonb_as(v_admin::text, 'SELECT public.get_admin_command_center_summary()') -> 'kpis';

  PERFORM pg_temp.assert_true(
    v_kpis ? 'total_tax',
    'T8: KPIs include total_tax field'
  );

  -- =====================================================================
  -- TEST 9: KPIs include total_indirect_cost field
  -- =====================================================================
  PERFORM pg_temp.assert_true(
    v_kpis ? 'total_indirect_cost',
    'T9: KPIs include total_indirect_cost field'
  );

  -- =====================================================================
  -- TEST 10: Financial formula — result = revenue - labor - tax - indirect
  -- =====================================================================
  v_revenue := (v_kpis->>'total_revenue')::NUMERIC;
  v_labor := (v_kpis->>'total_labor_cost')::NUMERIC;
  v_tax := (v_kpis->>'total_tax')::NUMERIC;
  v_indirect := (v_kpis->>'total_indirect_cost')::NUMERIC;
  v_result := (v_kpis->>'total_result')::NUMERIC;
  v_expected_result := v_revenue - v_labor - v_tax - v_indirect;

  PERFORM pg_temp.assert_eq(v_result, v_expected_result,
    'T10: Financial formula: result = revenue - labor_cost - tax - indirect_cost');

  -- =====================================================================
  -- TEST 11: Margin = result / revenue * 100 (when revenue > 0)
  -- =====================================================================
  v_margin := (v_kpis->>'total_margin')::NUMERIC;

  IF v_revenue > 0 THEN
    v_expected_margin := ROUND((v_result / v_revenue * 100), 2);
    PERFORM pg_temp.assert_eq(v_margin, v_expected_margin,
      'T11: Margin = result / revenue * 100 (when revenue > 0)');
  ELSE
    PERFORM pg_temp.assert_eq(v_margin, 0,
      'T11: Margin = 0 when revenue = 0');
  END IF;

  -- =====================================================================
  -- TEST 12: Member can call get_professional_dashboard_stats for own user
  -- =====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana)),
    'T12: member can call get_professional_dashboard_stats for own user'
  );

  -- =====================================================================
  -- TEST 13: Member CANNOT call get_professional_dashboard_stats for another user
  -- =====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_bruno)),
    'T13: member cannot call get_professional_dashboard_stats for another user'
  );

  -- =====================================================================
  -- TEST 14: Admin can call get_professional_dashboard_stats for any user
  -- =====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana)),
    'T14: admin can call get_professional_dashboard_stats for any user'
  );

  -- =====================================================================
  -- TEST 15: search_global returns empty for queries < 2 chars
  -- =====================================================================
  v_search := pg_temp.jsonb_as(v_admin::text, 'SELECT public.search_global(''a'', 8)');

  PERFORM pg_temp.assert_eq(
    v_search->>'projects',
    '[]',
    'T15: search_global returns empty projects for queries < 2 chars'
  );

  RAISE NOTICE 'ALL PHASE 3.1 HARDENING TESTS PASSED';
END;
$test$;
