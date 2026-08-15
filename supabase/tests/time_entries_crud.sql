-- Real assertion-based DB tests for time entries CRUD boundaries, approvals,
-- rejection reasons, approval history, audit, and closed-period protection.
--
-- Run via: supabase test db  (or psql against local DB)
-- A test "passes" when its expectation holds; failures raise an exception,
-- aborting the file with a clear message.

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

-- Helper: read a time_entry's description as service_role (bypasses RLS).
CREATE OR REPLACE FUNCTION pg_temp.entry_desc(p_id UUID)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_desc TEXT;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'service_role');
  SELECT description INTO v_desc FROM time_entries WHERE id = p_id;
  RETURN v_desc;
END;
$$;

-- Helper: check a time_entry exists as service_role.
CREATE OR REPLACE FUNCTION pg_temp.entry_exists(p_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'service_role');
  SELECT EXISTS (SELECT 1 FROM time_entries WHERE id = p_id) INTO v_exists;
  RETURN v_exists;
END;
$$;

-- Constants
DO $$
DECLARE
  v_ana UUID := '550e8400-e29b-41d4-a716-446655550001';
  v_bruno UUID := '550e8400-e29b-41d4-a716-446655550002';
  v_admin UUID := '550e8400-e29b-41d4-a716-446655550099';
  v_proj UUID := '550e8400-e29b-41d4-a716-446655440001';
  v_entry_id UUID;
  v_other_entry UUID;
  v_count INT;
BEGIN
  -- ----------------------------------------------------------------
  -- Setup: create a pending entry for Ana and one for Bruno.
  -- We use service_role (bypasses RLS) with jwt sub set so the
  -- prevent_professional_id_manipulation trigger passes.
  -- ----------------------------------------------------------------
  v_entry_id := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-02-01'', 60, ''Setup pending Ana entry here'', ''pending'', 120) RETURNING id',
    v_proj, v_ana
  ));
  v_other_entry := pg_temp.svc_as_uuid(v_bruno::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-02-01'', 60, ''Setup pending Bruno entry here'', ''pending'', 150) RETURNING id',
    v_proj, v_bruno
  ));

  -- ====================================================================
  -- TEST 1: member creates own pending entry -> PASS
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-03-01'', 60, ''Ana creating own entry test'', ''pending'', 0)',
      v_proj, v_ana
    )),
    'T1: member should create own pending entry'
  );

  -- ====================================================================
  -- TEST 2: member creates entry for another user -> FAIL
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-03-01'', 60, ''Ana creating for Bruno test'', ''pending'', 0)',
      v_proj, v_bruno
    )),
    'T2: member must NOT create entry for another user'
  );

  -- ====================================================================
  -- TEST 3: member creates entry with approved status -> FAIL
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-03-01'', 60, ''Ana creating approved entry test'', ''approved'', 0)',
      v_proj, v_ana
    )),
    'T3: member must NOT create non-pending entry'
  );

  -- ====================================================================
  -- TEST 4: member edits own pending entry -> PASS
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'UPDATE time_entries SET duration_minutes = 90, description = ''Ana editing own pending entry test'' WHERE id = %L',
      v_entry_id
    )),
    'T4: member should edit own pending entry'
  );

  -- ====================================================================
  -- TEST 5: member edits another user's pending entry -> NO EFFECT (RLS)
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'UPDATE time_entries SET description = ''Ana editing Bruno entry test'' WHERE id = %L',
    v_other_entry
  ));
  PERFORM pg_temp.assert_eq(
    pg_temp.entry_desc(v_other_entry),
    'Setup pending Bruno entry here',
    'T5: member must NOT edit another user entry (description unchanged)'
  );

  -- ====================================================================
  -- TEST 6: member changes professional_id on own entry -> FAIL
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'UPDATE time_entries SET professional_id = %L WHERE id = %L',
      v_bruno, v_entry_id
    )),
    'T6: member must NOT change professional_id'
  );

  -- ====================================================================
  -- TEST 7: member changes approval_status to approved on own entry -> FAIL
  -- (RLS WITH CHECK enforces approval_status='pending' for non-admin updates)
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'UPDATE time_entries SET approval_status = ''approved'' WHERE id = %L',
      v_entry_id
    )),
    'T7: member must NOT approve own entry'
  );

  -- ====================================================================
  -- TEST 8: member deletes own pending entry -> PASS
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'DELETE FROM time_entries WHERE id = %L',
      v_entry_id
    )),
    'T8: member should delete own pending entry'
  );

  -- ====================================================================
  -- TEST 9: member deletes another user's pending entry -> NO EFFECT (RLS)
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'DELETE FROM time_entries WHERE id = %L',
    v_other_entry
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.entry_exists(v_other_entry),
    'T9: member must NOT delete another user entry (still exists)'
  );

  -- ----------------------------------------------------------------
  -- Setup approved + rejected entries for Ana to test immutability.
  -- ----------------------------------------------------------------
  v_entry_id := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-02-02'', 60, ''Setup approved Ana entry test'', ''pending'', 120) RETURNING id',
    v_proj, v_ana
  ));

  -- Admin approves via RPC
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_entry_id)),
    'T10-setup: admin should approve entry'
  );

  -- ====================================================================
  -- TEST 10: member edits own APPROVED entry -> NO EFFECT (RLS)
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'UPDATE time_entries SET description = ''Ana editing approved entry test'' WHERE id = %L',
    v_entry_id
  ));
  PERFORM pg_temp.assert_eq(
    pg_temp.entry_desc(v_entry_id),
    'Setup approved Ana entry test',
    'T10: member must NOT edit approved entry (description unchanged)'
  );

  -- ====================================================================
  -- TEST 11: member deletes own APPROVED entry -> NO EFFECT (RLS)
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'DELETE FROM time_entries WHERE id = %L',
    v_entry_id
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.entry_exists(v_entry_id),
    'T11: member must NOT delete approved entry (still exists)'
  );

  -- ====================================================================
  -- TEST 12: approval history recorded for the approve transition
  -- ====================================================================
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM time_entry_approval_history WHERE time_entry_id = v_entry_id;
  PERFORM pg_temp.assert_eq(v_count, 1, 'T12: approval history should have 1 row');
  RESET ROLE;

  -- ----------------------------------------------------------------
  -- Create a pending entry then reject it (with reason) for rejected tests.
  -- ----------------------------------------------------------------
  v_entry_id := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-02-03'', 60, ''Setup to reject Ana entry test'', ''pending'', 120) RETURNING id',
    v_proj, v_ana
  ));

  -- ====================================================================
  -- TEST 13: admin rejects WITHOUT reason -> FAIL
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_admin::text, format('SELECT public.reject_time_entry(%L, NULL)', v_entry_id)),
    'T13: admin must NOT reject without reason'
  );

  -- ====================================================================
  -- TEST 14: admin rejects WITH short reason (<10 chars) -> FAIL
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_admin::text, format('SELECT public.reject_time_entry(%L, %L)', v_entry_id, 'short')),
    'T14: admin must NOT reject with short reason'
  );

  -- ====================================================================
  -- TEST 15: admin rejects WITH valid reason -> PASS
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.reject_time_entry(%L, %L)', v_entry_id, 'Descrição insuficiente para aprovação do apontamento')),
    'T15: admin should reject with valid reason'
  );

  -- ====================================================================
  -- TEST 16: rejected entry has reason, rejected_by, rejected_at set
  -- ====================================================================
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM time_entries
    WHERE id = v_entry_id AND approval_status = 'rejected'
      AND rejection_reason IS NOT NULL AND rejected_by = v_admin::uuid AND rejected_at IS NOT NULL;
  PERFORM pg_temp.assert_eq(v_count, 1, 'T16: rejected entry metadata must be set');
  RESET ROLE;

  -- ====================================================================
  -- TEST 17: member edits own REJECTED entry -> NO EFFECT (RLS)
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'UPDATE time_entries SET description = ''Ana editing rejected entry test'' WHERE id = %L',
    v_entry_id
  ));
  PERFORM pg_temp.assert_eq(
    pg_temp.entry_desc(v_entry_id),
    'Setup to reject Ana entry test',
    'T17: member must NOT edit rejected entry (description unchanged)'
  );

  -- ====================================================================
  -- TEST 18: member deletes own REJECTED entry -> NO EFFECT (RLS)
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'DELETE FROM time_entries WHERE id = %L',
    v_entry_id
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.entry_exists(v_entry_id),
    'T18: member must NOT delete rejected entry (still exists)'
  );

  -- ====================================================================
  -- TEST 19: approval history has pending->rejected row with reason
  -- ====================================================================
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM time_entry_approval_history
    WHERE time_entry_id = v_entry_id AND previous_status = 'pending' AND new_status = 'rejected'
      AND reason IS NOT NULL;
  PERFORM pg_temp.assert_eq(v_count, 1, 'T19: history should record pending->rejected with reason');
  RESET ROLE;

  -- ====================================================================
  -- TEST 20: member cannot view another member's approval history
  -- ====================================================================
  v_other_entry := pg_temp.svc_as_uuid(v_bruno::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-02-04'', 60, ''Bruno entry for history visibility test'', ''pending'', 150) RETURNING id',
    v_proj, v_bruno
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_other_entry)),
    'T20-setup: admin should approve Bruno entry'
  );
  -- Ana should see 0 history rows for Bruno's entry (RLS filters, no error)
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_ana::text, format('SELECT count(*) FROM time_entry_approval_history WHERE time_entry_id = %L', v_other_entry)),
    0::BIGINT,
    'T20: member must NOT see another member history'
  );

  -- ====================================================================
  -- TEST 21: member cannot read audit_logs (RLS returns 0 rows)
  -- ====================================================================
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM audit_logs'),
    0::BIGINT,
    'T21: member must NOT read audit_logs'
  );

  -- ====================================================================
  -- TEST 22: member cannot call approve_time_entry RPC
  -- ====================================================================
  v_entry_id := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-02-05'', 60, ''Entry for member approve attempt test'', ''pending'', 120) RETURNING id',
    v_proj, v_ana
  ));
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format('SELECT public.approve_time_entry(%L)', v_entry_id)),
    'T22: member must NOT call approve_time_entry'
  );

  -- ====================================================================
  -- TEST 23: admin batch approve processes only pending entries
  -- ====================================================================
  v_entry_id := pg_temp.svc_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-02-06'', 60, ''Batch approve entry one test'', ''pending'', 120) RETURNING id',
    v_proj, v_ana
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.batch_approve_time_entries(ARRAY[%L::uuid])', v_entry_id)),
    'T23: admin should batch approve pending entry'
  );
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM time_entries WHERE id = v_entry_id AND approval_status = 'approved';
  PERFORM pg_temp.assert_eq(v_count, 1, 'T23: batch approved entry should be approved');
  RESET ROLE;

  -- ====================================================================
  -- TEST 24: batch approve on already-approved entry returns failed status
  -- ====================================================================
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_admin::text, format(
      'SELECT count(*) FROM public.batch_approve_time_entries(ARRAY[%L::uuid]) WHERE status = ''failed''',
      v_entry_id
    )),
    1::BIGINT,
    'T24: batch approve of approved entry should report 1 failed'
  );

  -- ====================================================================
  -- TEST 25: closed period blocks member insert
  -- ====================================================================
  SET LOCAL ROLE service_role;
  -- Idempotent: reset the period to 'open' so the close below works on
  -- repeated runs (the test runner may execute this file more than once
  -- against the same database without a reset in between).
  INSERT INTO accounting_periods (period_key, status) VALUES ('2024-04', 'open')
  ON CONFLICT (period_key) DO UPDATE SET status = 'open';
  RESET ROLE;
  -- close April 2024 as admin
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.close_accounting_period(''2024-04'')'),
    'T25-setup: admin should close period'
  );
  -- member tries to insert in closed period -> FAIL
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-04-10'', 60, ''Ana inserting in closed period test'', ''pending'', 0)',
      v_proj, v_ana
    )),
    'T25: member must NOT insert in closed period'
  );

  -- ====================================================================
  -- TEST 26: member can still insert in OPEN period
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-05-10'', 60, ''Ana inserting in open period test'', ''pending'', 0)',
      v_proj, v_ana
    )),
    'T26: member should insert in open period'
  );

  -- ====================================================================
  -- TEST 27: admin reopens period (audited) and member can insert again
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, 'SELECT public.reopen_accounting_period(''2024-04'')'),
    'T27-setup: admin should reopen period'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, ''2024-04-11'', 60, ''Ana inserting after reopen test'', ''pending'', 0)',
      v_proj, v_ana
    )),
    'T27: member should insert after period reopened'
  );

  -- ====================================================================
  -- TEST 28: audit log recorded for close + reopen actions
  -- ====================================================================
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM audit_logs WHERE action IN ('close_accounting_period','reopen_accounting_period');
  PERFORM pg_temp.assert_true(v_count >= 2, 'T28: audit log should record close+reopen');
  RESET ROLE;

  RAISE NOTICE 'ALL DB TESTS PASSED';
END
$$;
