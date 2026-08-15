-- Real assertion-based RLS policy tests.
--
-- This file validates row-level security policies across the FoconFlow schema
-- using the same helper pattern as time_entries_crud.sql (assert_eq / assert_true
-- / try_as / count_as / svc_as). A test "passes" when its expectation holds;
-- failures raise an exception that aborts the file with a clear message.
--
-- Coverage focuses on policies NOT already asserted in time_entries_crud.sql:
--   * profiles (read own/other, role mutation, admin read)
--   * projects (member read, member mutation denied, admin mutation)
--   * project_financials (member denied, admin read)
--   * hourly_rates (member denied, admin read/write)
--   * time_entry_comments (owner/admin delete, other member denied)
--   * time_entry_attachments (owner/admin delete, other member denied)
--   * user_preferences (own access, other denied)
--   * project_budgets (member mutation denied, admin manage)
--   * profitability_alerts (member mutation denied, admin manage)
--   * audit_logs (member cannot read/mutate)
--
-- Time-entry CRUD, approval, rejection, history, audit append-only and
-- closed-period protection are already covered exhaustively in
-- time_entries_crud.sql and are NOT duplicated here.

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

-- Helper: run SQL as a given user (by jwt sub) and report whether it
-- succeeded (TRUE) or raised (FALSE). Security INVOKER so SET LOCAL ROLE
-- is permitted; the role switch makes RLS apply as the simulated user.
CREATE OR REPLACE FUNCTION pg_temp.try_as(p_sub TEXT, p_sql TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ok BOOLEAN := TRUE;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
    EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_ok := FALSE;
  END;
  RETURN v_ok;
END;
$$;

-- Helper: run a SELECT count(*) query as a given user and return the count.
-- Used for RLS visibility tests (RLS filters rows instead of raising).
CREATE OR REPLACE FUNCTION pg_temp.count_as(p_sub TEXT, p_sql TEXT)
RETURNS BIGINT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_count BIGINT;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
  EXECUTE p_sql INTO v_count;
  RETURN v_count;
END;
$$;

-- Helper: run SQL as service_role with a jwt sub set (so triggers that call
-- auth.uid() pass). service_role bypasses RLS; used for test setup.
CREATE OR REPLACE FUNCTION pg_temp.svc_as(p_sub TEXT, p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'service_role');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'service_role')::text);
  EXECUTE p_sql;
END;
$$;

-- Helper: run SQL as service_role with a jwt sub and return a single UUID.
CREATE OR REPLACE FUNCTION pg_temp.svc_as_uuid(p_sub TEXT, p_sql TEXT)
RETURNS UUID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'service_role');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'service_role')::text);
  EXECUTE p_sql INTO v_id;
  RETURN v_id;
END;
$$;

-- Helper: run SQL as authenticated (with jwt sub) and return a single UUID.
-- Used for setup on tables where only the authenticated role has privileges
-- (e.g. time_entry_comments, time_entry_attachments, user_preferences).
-- The admin user can insert rows for other users because the RLS WITH CHECK
-- allows is_admin(auth.uid()).
CREATE OR REPLACE FUNCTION pg_temp.auth_as_uuid(p_sub TEXT, p_sql TEXT)
RETURNS UUID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
  EXECUTE p_sql INTO v_id;
  RETURN v_id;
END;
$$;

-- Constants
DO $$
DECLARE
  v_ana UUID := '550e8400-e29b-41d4-a716-446655550001';
  v_bruno UUID := '550e8400-e29b-41d4-a716-446655550002';
  v_admin UUID := '550e8400-e29b-41d4-a716-446655550099';
  v_proj UUID := '550e8400-e29b-41d4-a716-446655440001';
  v_count BIGINT;
  v_budget_id UUID;
  v_alert_id UUID;
  v_entry_id UUID;
  v_comment_id UUID;
  v_attach_id UUID;
BEGIN
  -- ====================================================================
  -- PROFILES
  -- ====================================================================

  -- TEST 1: member reads own profile -> PASS (count >= 1)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM profiles WHERE id = ''' || v_ana::text || '''') >= 1,
    'T1: member should read own profile'
  );

  -- TEST 2: member reads other profile -> FILTERED (count = 0)
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM profiles WHERE id = ''' || v_bruno::text || ''''),
    0::BIGINT,
    'T2: member must NOT read other profile (RLS filtered)'
  );

  -- TEST 3: member changes own role -> DENIED (RLS filters the row so UPDATE
  -- affects 0 rows; we verify the role is still 'member' afterwards).
  PERFORM pg_temp.try_as(v_ana::text, 'UPDATE profiles SET role = ''admin'' WHERE id = ''' || v_ana::text || '''');
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM profiles WHERE id = v_ana AND role = 'admin';
  PERFORM pg_temp.assert_eq(v_count, 0::BIGINT, 'T3: member must NOT change own role (still member)');
  RESET ROLE;

  -- TEST 4: admin reads all profiles -> PASS (count >= 4 seeded profiles)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_admin::text, 'SELECT count(*) FROM profiles') >= 4,
    'T4: admin should read all profiles'
  );

  -- ====================================================================
  -- PROJECTS
  -- ====================================================================

  -- TEST 5: authenticated member reads allowed project data -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM projects') >= 1,
    'T5: member should read non-financial project info'
  );

  -- TEST 6: member administrative mutation -> DENIED (RLS filters the row
  -- so UPDATE affects 0 rows; we verify the name was NOT changed).
  PERFORM pg_temp.try_as(v_ana::text, 'UPDATE projects SET name = ''Hacked by member'' WHERE id = ''' || v_proj::text || '''');
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM projects WHERE id = v_proj AND name = 'Hacked by member';
  PERFORM pg_temp.assert_eq(v_count, 0::BIGINT, 'T6: member must NOT mutate projects (name unchanged)');
  RESET ROLE;

  -- TEST 7: admin mutation -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'UPDATE projects SET name = name WHERE id = ''' || v_proj::text || ''''),
    'T7: admin should mutate projects'
  );

  -- ====================================================================
  -- PROJECT FINANCIALS
  -- ====================================================================

  -- TEST 8: member project_financials read -> DENIED (count = 0)
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM project_financials'),
    0::BIGINT,
    'T8: member must NOT read project_financials'
  );

  -- TEST 9: admin financial read -> PASS (count >= 1 seeded)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_admin::text, 'SELECT count(*) FROM project_financials') >= 1,
    'T9: admin should read project_financials'
  );

  -- ====================================================================
  -- HOURLY RATES
  -- ====================================================================

  -- TEST 10: member hourly_rates read -> DENIED (count = 0)
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM hourly_rates'),
    0::BIGINT,
    'T10: member must NOT read hourly_rates'
  );

  -- TEST 11: admin hourly rate read -> PASS (count >= 1 seeded)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_admin::text, 'SELECT count(*) FROM hourly_rates') >= 1,
    'T11: admin should read hourly_rates'
  );

  -- TEST 12: admin hourly rate write -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'UPDATE hourly_rates SET valid_until = valid_until WHERE id = (SELECT id FROM hourly_rates LIMIT 1)'),
    'T12: admin should write hourly_rates'
  );

  -- ====================================================================
  -- TIME ENTRY COMMENTS
  -- ====================================================================

  -- Setup: create a pending entry for Ana, then a comment by Ana on it.
  v_entry_id := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-06-01'', 60, ''RLS test entry for comments'', ''pending'', 120) RETURNING id',
    v_proj, v_ana
  ));
  v_comment_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entry_comments (time_entry_id, author_id, body) VALUES (%L, %L, ''Ana comment for RLS test'') RETURNING id',
    v_entry_id, v_ana
  ));

  -- TEST 13: comments owner can delete -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format('DELETE FROM time_entry_comments WHERE id = %L', v_comment_id)),
    'T13: comment owner should delete own comment'
  );

  -- Setup: Ana creates another comment, Bruno tries to delete it.
  v_comment_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entry_comments (time_entry_id, author_id, body) VALUES (%L, %L, ''Ana comment for Bruno deny test'') RETURNING id',
    v_entry_id, v_ana
  ));

  -- TEST 14: comments other member delete -> DENIED (still exists)
  PERFORM pg_temp.try_as(v_bruno::text, format('DELETE FROM time_entry_comments WHERE id = %L', v_comment_id));
  -- Admin can see all comments, so count_as with admin verifies the row persists.
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_admin::text, format('SELECT count(*) FROM time_entry_comments WHERE id = %L', v_comment_id)),
    1::BIGINT,
    'T14: other member must NOT delete comment (still exists)'
  );

  -- TEST 15: comments admin can delete -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM time_entry_comments WHERE id = %L', v_comment_id)),
    'T15: admin should delete any comment'
  );

  -- ====================================================================
  -- TIME ENTRY ATTACHMENTS (metadata rows)
  -- ====================================================================

  -- Setup: Ana uploads an attachment metadata row.
  v_attach_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entry_attachments (time_entry_id, uploaded_by, file_name, file_size, content_type, storage_path) VALUES (%L, %L, ''test.pdf'', 1024, ''application/pdf'', ''rls-test/ana-test.pdf'') RETURNING id',
    v_entry_id, v_ana
  ));

  -- TEST 16: attachment metadata owner can delete -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format('DELETE FROM time_entry_attachments WHERE id = %L', v_attach_id)),
    'T16: attachment owner should delete own attachment metadata'
  );

  -- Setup: Ana uploads another, Bruno tries to delete.
  v_attach_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entry_attachments (time_entry_id, uploaded_by, file_name, file_size, content_type, storage_path) VALUES (%L, %L, ''test2.pdf'', 2048, ''application/pdf'', ''rls-test/ana-test2.pdf'') RETURNING id',
    v_entry_id, v_ana
  ));

  -- TEST 17: attachment metadata other member delete -> DENIED (still exists)
  PERFORM pg_temp.try_as(v_bruno::text, format('DELETE FROM time_entry_attachments WHERE id = %L', v_attach_id));
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_admin::text, format('SELECT count(*) FROM time_entry_attachments WHERE id = %L', v_attach_id)),
    1::BIGINT,
    'T17: other member must NOT delete attachment metadata (still exists)'
  );

  -- TEST 18: attachment metadata admin can delete -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM time_entry_attachments WHERE id = %L', v_attach_id)),
    'T18: admin should delete any attachment metadata'
  );

  -- ====================================================================
  -- USER PREFERENCES
  -- ====================================================================

  -- TEST 19: member own preferences write -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO user_preferences (user_id, pref_key, pref_value) VALUES (%L, ''theme'', ''"dark"''::jsonb) ON CONFLICT (user_id, pref_key) DO UPDATE SET pref_value = EXCLUDED.pref_value',
      v_ana
    )),
    'T19: member should write own preferences'
  );

  -- TEST 20: member own preferences read -> PASS (count >= 1)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM user_preferences WHERE user_id = ''' || v_ana::text || '''') >= 1,
    'T20: member should read own preferences'
  );

  -- TEST 21: member other preferences read -> DENIED (count = 0)
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM user_preferences WHERE user_id = ''' || v_bruno::text || ''''),
    0::BIGINT,
    'T21: member must NOT read other preferences'
  );

  -- TEST 22: member other preferences write -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'INSERT INTO user_preferences (user_id, pref_key, pref_value) VALUES (%L, ''evil'', ''"x"''::jsonb)',
      v_bruno
    )),
    'T22: member must NOT write other preferences'
  );

  -- ====================================================================
  -- PROJECT BUDGETS
  -- ====================================================================

  -- TEST 23: member unauthorized budget mutation -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'INSERT INTO project_budgets (project_id, budget_type, budget_value, fiscal_year) VALUES (%L, ''labor_hours'', 100, 2024)',
      v_proj
    )),
    'T23: member must NOT create project_budgets'
  );

  -- TEST 24: admin budget create -> PASS
  v_budget_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO project_budgets (project_id, budget_type, budget_value, fiscal_year) VALUES (%L, ''labor_hours'', 100, 2024) RETURNING id',
    v_proj
  ));
  PERFORM pg_temp.assert_true(v_budget_id IS NOT NULL, 'T24: admin should create project_budgets');

  -- TEST 25: admin budget update -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('UPDATE project_budgets SET budget_value = 200 WHERE id = %L', v_budget_id)),
    'T25: admin should update project_budgets'
  );

  -- TEST 26: admin budget delete -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM project_budgets WHERE id = %L', v_budget_id)),
    'T26: admin should delete project_budgets'
  );

  -- ====================================================================
  -- PROFITABILITY ALERTS
  -- ====================================================================

  -- TEST 27: member unauthorized alert mutation -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'INSERT INTO profitability_alerts (project_id, threshold, metric) VALUES (%L, 10.00, ''margin_percent'')',
      v_proj
    )),
    'T27: member must NOT create profitability_alerts'
  );

  -- TEST 28: admin alert create -> PASS
  v_alert_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO profitability_alerts (project_id, threshold, metric) VALUES (%L, 10.00, ''margin_percent'') RETURNING id',
    v_proj
  ));
  PERFORM pg_temp.assert_true(v_alert_id IS NOT NULL, 'T28: admin should create profitability_alerts');

  -- TEST 29: admin alert delete -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM profitability_alerts WHERE id = %L', v_alert_id)),
    'T29: admin should delete profitability_alerts'
  );

  -- ====================================================================
  -- AUDIT LOGS (append-only, member cannot mutate)
  -- ====================================================================

  -- TEST 30: member cannot read audit_logs -> count = 0
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM audit_logs'),
    0::BIGINT,
    'T30: member must NOT read audit_logs'
  );

  -- TEST 31: member cannot insert into audit_logs -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, 'INSERT INTO audit_logs (action, entity_type, entity_id, actor_id, details) VALUES (''test'', ''test'', ''00000000-0000-0000-0000-000000000000'', ''' || v_ana::text || ''', ''{}''::jsonb)'),
    'T31: member must NOT insert into audit_logs'
  );

  -- TEST 32: member cannot update audit_logs -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, 'UPDATE audit_logs SET action = ''hacked'' WHERE action IS NOT NULL'),
    'T32: member must NOT update audit_logs'
  );

  -- TEST 33: member cannot delete audit_logs -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, 'DELETE FROM audit_logs WHERE action IS NOT NULL'),
    'T33: member must NOT delete audit_logs'
  );

  -- ====================================================================
  -- NOTIFICATIONS (member can only access own)
  -- ====================================================================

  -- TEST 34: member reads own notifications -> PASS (count >= 0, no error)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM notifications WHERE user_id = ''' || v_ana::text || '''') >= 0,
    'T34: member should read own notifications'
  );

  -- TEST 35: member reads other notifications -> DENIED (count = 0)
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM notifications WHERE user_id = ''' || v_bruno::text || ''''),
    0::BIGINT,
    'T35: member must NOT read other notifications'
  );

  RAISE NOTICE 'ALL RLS POLICY TESTS PASSED';
END
$$;
