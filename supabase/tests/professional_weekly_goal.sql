-- Test suite for migration 20240821: professional weekly goal consistency.
-- Covers the 6 scenarios from the Phase 3.2 final review:
--   1. No preference → configured=false, nulls
--   2. Goal configured → exact approved/pending/rejected/registered/remaining/progress
--   3. Temporal isolation → previous/next week entries don't affect current week
--   4. Rejected excluded → registered = approved + pending only
--   5. Authorization → member can query own stats, not others; admin can query any
--   6. Invalid/zero preference → treated as not configured

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

-- Helper: run SQL with the closed-period trigger temporarily disabled.
-- The enforce_closed_period_delete trigger has a bug where RETURN NEW for
-- DELETE prevents ALL deletes (NEW is NULL for deletes), so we must disable
-- it to clean up approved/rejected entries between tests.
-- SECURITY DEFINER so ALTER TABLE works (function owner = postgres = table owner).
CREATE OR REPLACE FUNCTION pg_temp.pg_role(p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE 'ALTER TABLE public.time_entries DISABLE TRIGGER trg_enforce_closed_period_delete';
  EXECUTE p_sql;
  EXECUTE 'ALTER TABLE public.time_entries ENABLE TRIGGER trg_enforce_closed_period_delete';
END;
$$;

-- Helper: run SQL as the authenticated user (by jwt sub) for setup operations
-- that need RLS to apply as the user (e.g. user_preferences which has RLS
-- policies allowing users to manage their own prefs).
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

-- Constants
DO $$
DECLARE
  v_admin UUID;
  v_ana UUID;
  v_bruno UUID;
  v_proj UUID;
  v_week_start DATE;
  v_week_end DATE;
  v_prev_week DATE;
  v_next_week DATE;
  v_result JSONB;
  v_wg JSONB;
  v_entry_id UUID;
BEGIN
  -- Resolve test users from seed data
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_ana FROM profiles WHERE full_name = 'Ana Silva' LIMIT 1;
  SELECT id INTO v_bruno FROM profiles WHERE full_name = 'Bruno Santos' LIMIT 1;
  SELECT id INTO v_proj FROM projects LIMIT 1;

  -- Compute week boundaries (must match the RPC's date_trunc('week', ...) logic)
  v_week_start := date_trunc('week', CURRENT_DATE)::DATE;
  v_week_end := v_week_start + INTERVAL '6 days';
  v_prev_week := v_week_start - INTERVAL '7 days';
  v_next_week := v_week_end + INTERVAL '1 day';

  -- ========================================================================
  -- SCENARIO 1: No preference → configured=false, nulls
  -- ========================================================================
  -- Ensure no preference exists for Ana
  PERFORM pg_temp.user_as(v_ana::text, format('DELETE FROM user_preferences WHERE user_id = %L AND pref_key = ''expected_weekly_minutes''', v_ana));

  v_result := pg_temp.jsonb_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana));
  v_wg := v_result->'weekly_goal';

  PERFORM pg_temp.assert_false(
    pg_temp.jbool(v_wg, 'configured'),
    'S1: configured should be false when no preference'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.jtext(v_wg, 'goal_minutes') IS NULL,
    'S1: goal_minutes should be null when no preference'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.jtext(v_wg, 'progress_percent') IS NULL,
    'S1: progress_percent should be null when no preference'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.jtext(v_wg, 'remaining_minutes') IS NULL,
    'S1: remaining_minutes should be null when no preference'
  );

  -- ========================================================================
  -- SCENARIO 2: Goal configured → exact values
  -- goal = 2400 (40h)
  -- current week: approved=1200, pending=600, rejected=300
  -- Expected: registered=1800, remaining=600, progress=75
  -- ========================================================================
  -- Clean up any existing entries for Ana in the current week (use postgres
  -- to bypass the closed-period trigger bug that blocks non-admin deletes).
  PERFORM pg_temp.pg_role(format(
    'DELETE FROM time_entries WHERE professional_id = %L AND entry_date >= ''%s'' AND entry_date <= ''%s''',
    v_ana, v_week_start, v_week_end
  ));

  -- Set goal = 2400 minutes (40h)
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO user_preferences (user_id, pref_key, pref_value) VALUES (%L, ''expected_weekly_minutes'', ''{"minutes": 2400}''::jsonb) ON CONFLICT (user_id, pref_key) DO UPDATE SET pref_value = ''{"minutes": 2400}''::jsonb',
    v_ana
  ));

  -- Create entries: approved=1200, pending=600, rejected=300
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''%s'', 1200, ''S2 approved'', ''pending'', 120)',
    v_proj, v_ana, v_week_start
  ));
  -- Approve it
  PERFORM pg_temp.user_as(v_admin::text, format(
    'SELECT public.approve_time_entry((SELECT id FROM time_entries WHERE professional_id = %L AND description = ''S2 approved'' ORDER BY created_at DESC LIMIT 1))',
    v_ana
  ));

  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''%s'', 600, ''S2 pending'', ''pending'', 120)',
    v_proj, v_ana, v_week_start
  ));

  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''%s'', 300, ''S2 to reject'', ''pending'', 120)',
    v_proj, v_ana, v_week_start
  ));
  -- Reject it
  PERFORM pg_temp.user_as(v_admin::text, format(
    'SELECT public.reject_time_entry((SELECT id FROM time_entries WHERE professional_id = %L AND description = ''S2 to reject'' ORDER BY created_at DESC LIMIT 1), ''Descrição insuficiente para aprovação do apontamento'')',
    v_ana
  ));

  v_result := pg_temp.jsonb_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana));
  v_wg := v_result->'weekly_goal';

  PERFORM pg_temp.assert_true(
    pg_temp.jbool(v_wg, 'configured'),
    'S2: configured should be true'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'goal_minutes'), 2400,
    'S2: goal_minutes should be 2400'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'approved_minutes'), 1200,
    'S2: approved_minutes should be 1200'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'pending_minutes'), 600,
    'S2: pending_minutes should be 600'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'rejected_minutes'), 300,
    'S2: rejected_minutes should be 300'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'registered_minutes'), 1800,
    'S2: registered_minutes should be 1800 (approved + pending)'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'remaining_minutes'), 600,
    'S2: remaining_minutes should be 600'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jnum(v_wg, 'progress_percent'), 75::NUMERIC,
    'S2: progress_percent should be 75'
  );

  -- ========================================================================
  -- SCENARIO 3: Temporal isolation — previous/next week don't affect current
  -- previous week: approved=1440 (24h, max allowed by check constraint)
  -- next week: pending=960 (16h)
  -- Expected: current week numbers unchanged from S2
  -- ========================================================================
  -- Clean up any entries in prev/next week for Ana
  PERFORM pg_temp.user_as(v_ana::text, format(
    'DELETE FROM time_entries WHERE professional_id = %L AND entry_date = ''%s''',
    v_ana, v_prev_week
  ));
  PERFORM pg_temp.user_as(v_ana::text, format(
    'DELETE FROM time_entries WHERE professional_id = %L AND entry_date = ''%s''',
    v_ana, v_next_week
  ));

  -- Previous week: 1440 min approved (24h, max allowed)
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''%s'', 1440, ''S3 prev week'', ''pending'', 120)',
    v_proj, v_ana, v_prev_week
  ));
  PERFORM pg_temp.user_as(v_admin::text, format(
    'SELECT public.approve_time_entry((SELECT id FROM time_entries WHERE professional_id = %L AND description = ''S3 prev week'' ORDER BY created_at DESC LIMIT 1))',
    v_ana
  ));

  -- Next week: 960 min pending (16h)
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''%s'', 960, ''S3 next week'', ''pending'', 120)',
    v_proj, v_ana, v_next_week
  ));

  v_result := pg_temp.jsonb_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana));
  v_wg := v_result->'weekly_goal';

  -- Current week numbers must be unchanged
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'approved_minutes'), 1200,
    'S3: approved_minutes unchanged (prev week excluded)'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'pending_minutes'), 600,
    'S3: pending_minutes unchanged (next week excluded)'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'registered_minutes'), 1800,
    'S3: registered_minutes unchanged (temporal isolation)'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'remaining_minutes'), 600,
    'S3: remaining_minutes unchanged'
  );

  -- Clean up prev/next week entries
  PERFORM pg_temp.user_as(v_ana::text, format(
    'DELETE FROM time_entries WHERE professional_id = %L AND entry_date IN (''%s'', ''%s'')',
    v_ana, v_prev_week, v_next_week
  ));

  -- ========================================================================
  -- SCENARIO 4: Rejected excluded — registered = approved only when pending=0
  -- approved=1200, pending=0, rejected=1200
  -- Expected: registered=1200 (NOT 2400)
  -- ========================================================================
  -- Clean current week entries for Ana (use postgres to bypass the
  -- closed-period trigger bug that blocks non-admin deletes).
  PERFORM pg_temp.pg_role(format(
    'DELETE FROM time_entries WHERE professional_id = %L AND entry_date >= ''%s'' AND entry_date <= ''%s''',
    v_ana, v_week_start, v_week_end
  ));

  -- approved=1200
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''%s'', 1200, ''S4 approved'', ''pending'', 120)',
    v_proj, v_ana, v_week_start
  ));
  PERFORM pg_temp.user_as(v_admin::text, format(
    'SELECT public.approve_time_entry((SELECT id FROM time_entries WHERE professional_id = %L AND description = ''S4 approved'' ORDER BY created_at DESC LIMIT 1))',
    v_ana
  ));

  -- rejected=1200
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''%s'', 1200, ''S4 to reject'', ''pending'', 120)',
    v_proj, v_ana, v_week_start
  ));
  PERFORM pg_temp.user_as(v_admin::text, format(
    'SELECT public.reject_time_entry((SELECT id FROM time_entries WHERE professional_id = %L AND description = ''S4 to reject'' ORDER BY created_at DESC LIMIT 1), ''Descrição insuficiente para aprovação do apontamento'')',
    v_ana
  ));

  v_result := pg_temp.jsonb_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana));
  v_wg := v_result->'weekly_goal';

  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'approved_minutes'), 1200,
    'S4: approved_minutes should be 1200'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'pending_minutes'), 0,
    'S4: pending_minutes should be 0'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'rejected_minutes'), 1200,
    'S4: rejected_minutes should be 1200'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.jint(v_wg, 'registered_minutes'), 1200,
    'S4: registered_minutes should be 1200 (NOT 2400 — rejected excluded)'
  );

  -- ========================================================================
  -- SCENARIO 5: Authorization
  -- Ana: stats(Ana) PASS
  -- Ana: stats(Bruno) DENIED
  -- Admin: stats(Ana) PASS
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana)),
    'S5: Ana should query own stats'
  );
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_bruno)),
    'S5: Ana must NOT query Bruno stats'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana)),
    'S5: Admin should query Ana stats'
  );

  -- ========================================================================
  -- SCENARIO 6: Invalid/zero preference → treated as not configured
  -- Set preference to {minutes: 0} → configured should be false
  -- ========================================================================
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO user_preferences (user_id, pref_key, pref_value) VALUES (%L, ''expected_weekly_minutes'', ''{"minutes": 0}''::jsonb) ON CONFLICT (user_id, pref_key) DO UPDATE SET pref_value = ''{"minutes": 0}''::jsonb',
    v_ana
  ));

  v_result := pg_temp.jsonb_as(v_ana::text, format('SELECT public.get_professional_dashboard_stats(''%s''::uuid)', v_ana));
  v_wg := v_result->'weekly_goal';

  PERFORM pg_temp.assert_false(
    pg_temp.jbool(v_wg, 'configured'),
    'S6: configured should be false when minutes=0'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.jtext(v_wg, 'goal_minutes') IS NULL,
    'S6: goal_minutes should be null when minutes=0'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.jtext(v_wg, 'progress_percent') IS NULL,
    'S6: progress_percent should be null when minutes=0'
  );

  -- Clean up: remove the test preference
  PERFORM pg_temp.user_as(v_ana::text, format(
    'DELETE FROM user_preferences WHERE user_id = %L AND pref_key = ''expected_weekly_minutes''',
    v_ana
  ));

  -- Clean up: remove test entries from current week (use postgres to bypass
  -- the closed-period trigger bug).
  PERFORM pg_temp.pg_role(format(
    'DELETE FROM time_entries WHERE professional_id = %L AND entry_date >= ''%s'' AND entry_date <= ''%s'' AND description LIKE ''S%%''',
    v_ana, v_week_start, v_week_end
  ));

  RAISE NOTICE 'ALL PROFESSIONAL WEEKLY GOAL TESTS PASSED';
END
$$;
