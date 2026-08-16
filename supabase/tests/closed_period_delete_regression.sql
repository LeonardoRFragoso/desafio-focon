-- Regression suite for hotfix 20240824040000:
--   enforce_closed_period_time_entries() DELETE semantics.
--
-- Root cause being guarded against:
--   A BEFORE DELETE trigger must RETURN OLD to allow the delete. Returning
--   NEW (which is NULL on DELETE) silently cancels the operation without
--   raising. This suite verifies that authorized deletes actually remove
--   the row (row-count checks, not just "statement did not throw") and that
--   closed-period / immutability / cross-user protections remain intact.
--
-- Coverage (per hotfix spec T1-T9):
--   T1  member own pending + open period   DELETE -> PASS, row removed
--   T2  member own pending + closed period DELETE -> DENIED, row remains
--   T3  member other user's entry          DELETE -> DENIED (RLS)
--   T4  member approved entry              DELETE -> DENIED (RLS)
--   T5  member rejected entry              DELETE -> DENIED (RLS, behavior preserved)
--   T6  admin delete open-period entry     -> row removed (admin bypass preserved)
--   T7  INSERT open period                 -> no regression
--   T8  UPDATE open period                 -> no regression
--   T9  INSERT/UPDATE/DELETE closed period -> protections remain

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
  IF NOT cond THEN RAISE EXCEPTION 'ASSERT FAIL %', msg; END IF;
END;
$$;

-- Helper: run SQL as a given user (by jwt sub); TRUE if no error, FALSE if raised.
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

-- Helper: run SQL as a given user; TRUE only if it raised with the given prefix.
CREATE OR REPLACE FUNCTION pg_temp.try_as_expect_error(p_sub TEXT, p_sql TEXT, p_err_prefix TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_err TEXT;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
    EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err ILIKE p_err_prefix || '%' THEN RETURN TRUE; END IF;
    RAISE EXCEPTION 'Expected error prefix %, got: %', p_err_prefix, v_err;
  END;
  RETURN FALSE;
END;
$$;

-- Helper: run SQL as service_role with a jwt sub (test setup; bypasses RLS).
CREATE OR REPLACE FUNCTION pg_temp.svc_as(p_sub TEXT, p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'service_role');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'service_role')::text);
  EXECUTE p_sql;
END;
$$;

-- Helper: run SQL as service_role with jwt sub; return a single UUID.
CREATE OR REPLACE FUNCTION pg_temp.svc_as_uuid(p_sub TEXT, p_sql TEXT)
RETURNS UUID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'service_role');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'service_role')::text);
  EXECUTE p_sql INTO v_id;
  RETURN v_id;
END;
$$;

-- Helper: check a time_entry exists (service_role, bypasses RLS).
CREATE OR REPLACE FUNCTION pg_temp.entry_exists(p_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v BOOLEAN;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'service_role');
  SELECT EXISTS (SELECT 1 FROM time_entries WHERE id = p_id) INTO v;
  RETURN v;
END;
$$;

-- Helper: count time_entries matching a description prefix (service_role).
CREATE OR REPLACE FUNCTION pg_temp.count_by_desc(p_prefix TEXT)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v INTEGER;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'service_role');
  SELECT count(*) INTO v FROM time_entries WHERE description LIKE p_prefix || '%';
  RETURN v;
END;
$$;

DO $$
DECLARE
  v_ana    UUID := '550e8400-e29b-41d4-a716-446655550001';
  v_bruno  UUID := '550e8400-e29b-41d4-a716-446655550002';
  v_admin  UUID := '550e8400-e29b-41d4-a716-446655550099';
  v_proj   UUID := '550e8400-e29b-41d4-a716-446655440001';
  v_today  DATE := public.business_current_date();
  v_entry  UUID;
  v_other  UUID;
  v_count  INTEGER;
BEGIN
  -- Clean any prior run's fixtures.
  PERFORM pg_temp.svc_as(v_admin::text, 'DELETE FROM time_entries WHERE description LIKE ''CPD_%''');
  -- Ensure the closed-period test months start open (idempotent).
  PERFORM pg_temp.svc_as(v_admin::text, 'INSERT INTO accounting_periods (period_key, status) VALUES (''2024-06'', ''open'') ON CONFLICT (period_key) DO UPDATE SET status = ''open'', closed_by = NULL, closed_at = NULL');
  PERFORM pg_temp.svc_as(v_admin::text, 'INSERT INTO accounting_periods (period_key, status) VALUES (''2024-07'', ''open'') ON CONFLICT (period_key) DO UPDATE SET status = ''open'', closed_by = NULL, closed_at = NULL');

  -- ========================================================================
  -- T1: member own pending + open period DELETE -> PASS, row really removed
  -- ========================================================================
  v_entry := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, %L, 60, ''CPD_T1_open_pending'', ''pending'', 120, ''Test fixture late submission reason'') RETURNING id',
    v_proj, v_ana, v_today
  ));
  PERFORM pg_temp.assert_eq(pg_temp.count_by_desc('CPD_T1_open_pending'), 1, 'T1 before: 1 row');
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format('DELETE FROM time_entries WHERE id = %L', v_entry)),
    'T1: own pending open-period DELETE must not raise'
  );
  PERFORM pg_temp.assert_eq(pg_temp.count_by_desc('CPD_T1_open_pending'), 0, 'T1 after: row must be really removed');
  PERFORM pg_temp.assert_true(NOT pg_temp.entry_exists(v_entry), 'T1: entry_exists must be false');

  -- ========================================================================
  -- T2: member own pending + CLOSED period DELETE -> DENIED, row remains
  -- ========================================================================
  -- Close June 2024 as admin via the RPC (audited, privileged).
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.close_accounting_period(''2024-06'')'),
    'T2 setup: admin should close 2024-06'
  );
  -- Insert an entry in the closed month as admin (admin bypasses the
  -- closed-period trigger), owned by Ana, pending.
  v_entry := pg_temp.svc_as_uuid(v_admin::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, ''2024-06-10'', 60, ''CPD_T2_closed_pending'', ''pending'', 120, ''Test fixture late submission reason'') RETURNING id',
    v_proj, v_ana
  ));
  PERFORM pg_temp.assert_true(pg_temp.entry_exists(v_entry), 'T2 setup: closed entry exists');
  -- Ana attempts DELETE -> must raise the closed-period denial.
  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_ana::text, format('DELETE FROM time_entries WHERE id = %L', v_entry), 'Cannot delete a time entry in a closed accounting period'),
    'T2: closed-period DELETE must raise'
  );
  PERFORM pg_temp.assert_true(pg_temp.entry_exists(v_entry), 'T2: closed entry must still exist');
  -- Reopen for cleanup.
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.reopen_accounting_period(''2024-06'')'),
    'T2 cleanup: admin should reopen 2024-06'
  );

  -- ========================================================================
  -- T3: member other user's entry DELETE -> DENIED (RLS, no row affected)
  -- ========================================================================
  v_other := pg_temp.svc_as_uuid(v_bruno::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, %L, 60, ''CPD_T3_bruno_pending'', ''pending'', 150, ''Test fixture late submission reason'') RETURNING id',
    v_proj, v_bruno, v_today
  ));
  -- Ana tries to delete Bruno's entry: RLS filters the row so DELETE affects
  -- 0 rows and does not raise. The row must remain.
  PERFORM pg_temp.try_as(v_ana::text, format('DELETE FROM time_entries WHERE id = %L', v_other));
  PERFORM pg_temp.assert_true(pg_temp.entry_exists(v_other), 'T3: other user entry must remain (RLS denied)');

  -- ========================================================================
  -- T4: member approved entry DELETE -> DENIED (RLS)
  -- ========================================================================
  v_entry := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, %L, 60, ''CPD_T4_to_approve'', ''pending'', 120, ''Test fixture late submission reason'') RETURNING id',
    v_proj, v_ana, v_today
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_entry)),
    'T4 setup: admin should approve entry'
  );
  PERFORM pg_temp.try_as(v_ana::text, format('DELETE FROM time_entries WHERE id = %L', v_entry));
  PERFORM pg_temp.assert_true(pg_temp.entry_exists(v_entry), 'T4: approved entry must remain (RLS denied)');

  -- ========================================================================
  -- T5: member rejected entry DELETE -> DENIED (RLS, behavior preserved)
  -- ========================================================================
  v_entry := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, %L, 60, ''CPD_T5_to_reject'', ''pending'', 120, ''Test fixture late submission reason'') RETURNING id',
    v_proj, v_ana, v_today
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.reject_time_entry(%L, %L)', v_entry, 'Descrição insuficiente para aprovação do apontamento de teste')),
    'T5 setup: admin should reject entry'
  );
  PERFORM pg_temp.try_as(v_ana::text, format('DELETE FROM time_entries WHERE id = %L', v_entry));
  PERFORM pg_temp.assert_true(pg_temp.entry_exists(v_entry), 'T5: rejected entry must remain (RLS denied)');

  -- ========================================================================
  -- T6: admin delete open-period entry -> row removed (admin bypass preserved)
  -- ========================================================================
  v_entry := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, %L, 60, ''CPD_T6_admin_delete'', ''pending'', 120, ''Test fixture late submission reason'') RETURNING id',
    v_proj, v_ana, v_today
  ));
  PERFORM pg_temp.assert_true(pg_temp.entry_exists(v_entry), 'T6 setup: entry exists');
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM time_entries WHERE id = %L', v_entry)),
    'T6: admin DELETE of open-period entry must not raise'
  );
  PERFORM pg_temp.assert_true(NOT pg_temp.entry_exists(v_entry), 'T6: admin-deleted entry must be removed');

  -- ========================================================================
  -- T7: INSERT open period -> no regression
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, %L, 60, ''CPD_T7_insert_open'', ''pending'', 120, ''Test fixture late submission reason'')',
      v_proj, v_ana, v_today
    )),
    'T7: member should insert in open period'
  );
  PERFORM pg_temp.assert_eq(pg_temp.count_by_desc('CPD_T7_insert_open'), 1, 'T7: insert produced 1 row');

  -- ========================================================================
  -- T8: UPDATE open period -> no regression
  -- ========================================================================
  v_entry := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, %L, 60, ''CPD_T8_update_open'', ''pending'', 120, ''Test fixture late submission reason'') RETURNING id',
    v_proj, v_ana, v_today
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format('UPDATE time_entries SET duration_minutes = 90 WHERE id = %L', v_entry)),
    'T8: member should update own pending open-period entry'
  );

  -- ========================================================================
  -- T9: INSERT/UPDATE/DELETE closed period -> protections remain
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.close_accounting_period(''2024-07'')'),
    'T9 setup: admin should close 2024-07'
  );
  -- INSERT closed -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, ''2024-07-10'', 60, ''CPD_T9_insert_closed'', ''pending'', 0, ''Test fixture late submission reason'')',
      v_proj, v_ana
    )),
    'T9: member must NOT insert in closed period'
  );
  -- UPDATE closed -> DENIED. Seed an entry as admin first (admin bypass).
  v_entry := pg_temp.svc_as_uuid(v_admin::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, ''2024-07-11'', 60, ''CPD_T9_update_closed'', ''pending'', 120, ''Test fixture late submission reason'') RETURNING id',
    v_proj, v_ana
  ));
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format('UPDATE time_entries SET duration_minutes = 99 WHERE id = %L', v_entry)),
    'T9: member must NOT update in closed period'
  );
  -- DELETE closed -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format('DELETE FROM time_entries WHERE id = %L', v_entry)),
    'T9: member must NOT delete in closed period'
  );
  PERFORM pg_temp.assert_true(pg_temp.entry_exists(v_entry), 'T9: closed entry must remain');
  -- Reopen for cleanup.
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.reopen_accounting_period(''2024-07'')'),
    'T9 cleanup: admin should reopen 2024-07'
  );

  -- ----------------------------------------------------------------
  -- Cleanup all CPD_ fixtures.
  -- ----------------------------------------------------------------
  PERFORM pg_temp.svc_as(v_admin::text, 'DELETE FROM time_entries WHERE description LIKE ''CPD_%''');

  RAISE NOTICE 'ALL CLOSED-PERIOD DELETE REGRESSION TESTS PASSED';
END
$$;
