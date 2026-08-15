-- Test suite for hotfix migration 20240824020000:
-- Time Entry Approval / Rejection vs Temporal Rules Regression
--
-- Validates that:
--   1. Status-only updates (approve/reject) do NOT re-trigger temporal validation
--   2. Legacy retroactive entries (no late_reason) can be approved/rejected
--   3. Legacy future entries CANNOT be approved (explicit domain error)
--   4. Legacy future entries CAN be rejected
--   5. Legacy future entries CAN be corrected to a valid date
--   6. New entries still enforce temporal rules (future, late justification)
--   7. Batch approve handles future entries as partial failures
--   8. Batch reject can reject future entries
--   9. Closed period behavior preserved
--  10. Recurring future date still denied

-- ====================================================================
-- Helper functions
-- ====================================================================

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(actual anyelement, expected anyelement, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ASSERT FAIL %: got %, expected %', msg, actual, expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(cond BOOLEAN, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERT FAIL %', msg;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_false(cond BOOLEAN, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN
    RAISE EXCEPTION 'ASSERT FAIL (expected false) %', msg;
  END IF;
END;
$$;

-- Run SQL as a given user (by jwt sub) and report success/failure
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

-- Run SQL as a given user and return the error message (or NULL if success)
CREATE OR REPLACE FUNCTION pg_temp.err_as(p_sub TEXT, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_err TEXT := NULL;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
    EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  RETURN v_err;
END;
$$;

-- Run SQL as a given user and return a single value as TEXT
CREATE OR REPLACE FUNCTION pg_temp.val_as(p_sub TEXT, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_val TEXT;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
  EXECUTE p_sql INTO v_val;
  RETURN v_val;
END;
$$;

-- ====================================================================
-- Cleanup any leftover entries from previous test runs
-- ====================================================================
SET session_replication_role = 'replica';
DELETE FROM time_entry_approval_history WHERE time_entry_id::TEXT LIKE 'cccc0000%';
DELETE FROM time_entries WHERE id::TEXT LIKE 'cccc0000%';
DELETE FROM time_entries WHERE description LIKE 'T1 %' OR description LIKE 'T2 %' OR description LIKE 'T3 %' OR description LIKE 'T17 %';
SET session_replication_role = 'origin';

-- ====================================================================
-- Insert legacy entries bypassing triggers (requires superuser)
-- Done at top level, NOT inside a function
-- ====================================================================
SET session_replication_role = 'replica';

INSERT INTO time_entries (id, project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason, created_at, updated_at)
VALUES
  -- T4: Legacy retroactive 10d, no reason
  ('cccc0000-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE - 10, 480, 'T4 legacy retro 10d no reason', 'pending', 50.0, NULL, CURRENT_DATE - 10, CURRENT_DATE - 10),
  -- T5: Legacy retroactive 10d, no reason (for reject)
  ('cccc0000-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE - 10, 480, 'T5 legacy retro 10d no reason for reject', 'pending', 50.0, NULL, CURRENT_DATE - 10, CURRENT_DATE - 10),
  -- T6: Future legacy for approve denial
  ('cccc0000-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE + 11, 480, 'T6 future legacy for approve denial', 'pending', 50.0, NULL, CURRENT_DATE - 5, CURRENT_DATE - 5),
  -- T7: Future legacy for reject
  ('cccc0000-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE + 11, 480, 'T7 future legacy for reject', 'pending', 50.0, NULL, CURRENT_DATE - 5, CURRENT_DATE - 5),
  -- T8: Future legacy to be corrected to today
  ('cccc0000-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE + 11, 480, 'T8 future legacy to be corrected to today', 'pending', 50.0, NULL, CURRENT_DATE - 5, CURRENT_DATE - 5),
  -- T9: Future legacy to be corrected to 5d ago (no reason)
  ('cccc0000-0000-0000-0000-000000000006', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE + 11, 480, 'T9 future legacy to be corrected to 5d ago no reason', 'pending', 50.0, NULL, CURRENT_DATE - 5, CURRENT_DATE - 5),
  -- T10: Future legacy to be corrected to 5d ago (with reason)
  ('cccc0000-0000-0000-0000-000000000007', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE + 11, 480, 'T10 future legacy to be corrected to 5d ago with reason', 'pending', 50.0, NULL, CURRENT_DATE - 5, CURRENT_DATE - 5),
  -- T11: Legacy retro status-only approve test
  ('cccc0000-0000-0000-0000-000000000008', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE - 10, 480, 'T11 legacy retro status-only approve test', 'pending', 50.0, NULL, CURRENT_DATE - 10, CURRENT_DATE - 10),
  -- T12: Legacy retro status-only reject test
  ('cccc0000-0000-0000-0000-000000000009', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE - 10, 480, 'T12 legacy retro status-only reject test', 'pending', 50.0, NULL, CURRENT_DATE - 10, CURRENT_DATE - 10),
  -- T17: Batch future legacy
  ('cccc0000-0000-0000-0000-000000000010', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE + 11, 480, 'T17 batch future legacy', 'pending', 50.0, NULL, CURRENT_DATE - 5, CURRENT_DATE - 5),
  -- T18: Batch reject future legacy
  ('cccc0000-0000-0000-0000-000000000011', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE + 11, 480, 'T18 batch reject future legacy', 'pending', 50.0, NULL, CURRENT_DATE - 5, CURRENT_DATE - 5),
  -- T19: Closed period entry
  ('cccc0000-0000-0000-0000-000000000012', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', CURRENT_DATE - 60, 480, 'T19 closed period entry', 'pending', 50.0, NULL, CURRENT_DATE - 60, CURRENT_DATE - 60);

SET session_replication_role = 'origin';

-- ====================================================================
-- Create accounting period for T19 (closed period test)
-- ====================================================================
INSERT INTO accounting_periods (period_key, status, created_at, updated_at)
SELECT to_char(CURRENT_DATE - 60, 'YYYY-MM'), 'open', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounting_periods WHERE period_key = to_char(CURRENT_DATE - 60, 'YYYY-MM'));

-- ====================================================================
-- Test assertions
-- ====================================================================
DO $$
DECLARE
  v_ana UUID := '550e8400-e29b-41d4-a716-446655550001'; -- member
  v_admin UUID := '550e8400-e29b-41d4-a716-446655550099'; -- admin
  v_proj UUID := '550e8400-e29b-41d4-a716-446655440001'; -- Residencial Aurora
  v_err TEXT;
  v_val TEXT;
  v_id UUID;
  v_batch_result JSONB;
  v_period_key TEXT;
  v_normal1 UUID;
  v_normal2 UUID;
BEGIN
  -- ====================================================================
  -- T1: New today, approve → PASS
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, CURRENT_DATE, 480, ''T1 normal today entry for approval testing'', ''pending'', 50.0)',
    v_proj, v_ana
  ));
  v_id := pg_temp.val_as(v_ana::text, format(
    'SELECT id FROM time_entries WHERE professional_id = %L AND entry_date = CURRENT_DATE AND description = ''T1 normal today entry for approval testing'' ORDER BY created_at DESC LIMIT 1',
    v_ana
  ))::UUID;

  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_id)),
    'T1: approve today entry should PASS'
  );
  SELECT approval_status INTO v_val FROM time_entries WHERE id = v_id;
  PERFORM pg_temp.assert_eq(v_val, 'approved', 'T1: status should be approved');

  -- ====================================================================
  -- T2: New today, reject → PASS
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, CURRENT_DATE, 480, ''T2 normal today entry for rejection testing'', ''pending'', 50.0)',
    v_proj, v_ana
  ));
  v_id := pg_temp.val_as(v_ana::text, format(
    'SELECT id FROM time_entries WHERE professional_id = %L AND entry_date = CURRENT_DATE AND description = ''T2 normal today entry for rejection testing'' ORDER BY created_at DESC LIMIT 1',
    v_ana
  ))::UUID;

  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.reject_time_entry(%L, ''Rejeitando para teste de regressao do hotfix'')', v_id)),
    'T2: reject today entry should PASS'
  );
  SELECT approval_status INTO v_val FROM time_entries WHERE id = v_id;
  PERFORM pg_temp.assert_eq(v_val, 'rejected', 'T2: status should be rejected');

  -- ====================================================================
  -- T3: New yesterday, approve → PASS
  -- ====================================================================
  PERFORM pg_temp.try_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, CURRENT_DATE - 1, 480, ''T3 yesterday entry for approval testing'', ''pending'', 50.0)',
    v_proj, v_ana
  ));
  v_id := pg_temp.val_as(v_ana::text, format(
    'SELECT id FROM time_entries WHERE professional_id = %L AND description = ''T3 yesterday entry for approval testing'' ORDER BY created_at DESC LIMIT 1',
    v_ana
  ))::UUID;

  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_id)),
    'T3: approve yesterday entry should PASS'
  );

  -- ====================================================================
  -- T4: Legacy retroactive 10d, late_reason NULL, approve → PASS
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000001';
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_id)),
    'T4: approve legacy retro (10d, no reason) should PASS'
  );
  SELECT approval_status INTO v_val FROM time_entries WHERE id = v_id;
  PERFORM pg_temp.assert_eq(v_val, 'approved', 'T4: status should be approved');

  -- ====================================================================
  -- T5: Legacy retroactive 10d, late_reason NULL, reject → PASS
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000002';
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.reject_time_entry(%L, ''Rejeitando entrada retroativa legada sem justificativa'')', v_id)),
    'T5: reject legacy retro (10d, no reason) should PASS'
  );
  SELECT approval_status INTO v_val FROM time_entries WHERE id = v_id;
  PERFORM pg_temp.assert_eq(v_val, 'rejected', 'T5: status should be rejected');

  -- ====================================================================
  -- T6: Future legacy, approve → DENIED with FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000003';
  v_err := pg_temp.err_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_id));
  PERFORM pg_temp.assert_true(
    v_err IS NOT NULL AND v_err LIKE 'FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY%',
    'T6: approve future legacy should DENY with FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY'
  );
  SELECT approval_status INTO v_val FROM time_entries WHERE id = v_id;
  PERFORM pg_temp.assert_eq(v_val, 'pending', 'T6: status should still be pending after denial');

  -- ====================================================================
  -- T7: Future legacy, reject → PASS
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000004';
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.reject_time_entry(%L, ''Rejeitando entrada futura legada para limpeza'')', v_id)),
    'T7: reject future legacy should PASS'
  );
  SELECT approval_status INTO v_val FROM time_entries WHERE id = v_id;
  PERFORM pg_temp.assert_eq(v_val, 'rejected', 'T7: status should be rejected');

  -- ====================================================================
  -- T8: Future legacy edited to today → PASS
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000005';
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'UPDATE time_entries SET entry_date = CURRENT_DATE, updated_at = NOW() WHERE id = %L',
      v_id
    )),
    'T8: editing future legacy to today should PASS'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_id)),
    'T8: approve after correcting to today should PASS'
  );

  -- ====================================================================
  -- T9: Future legacy edited to 5d ago without reason → DENIED
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000006';
  v_err := pg_temp.err_as(v_ana::text, format(
    'UPDATE time_entries SET entry_date = CURRENT_DATE - 5, updated_at = NOW() WHERE id = %L',
    v_id
  ));
  PERFORM pg_temp.assert_true(
    v_err IS NOT NULL AND v_err LIKE 'FOCONFLOW_LATE_JUSTIFICATION%',
    'T9: editing future to 5d ago without reason should DENY with FOCONFLOW_LATE_JUSTIFICATION'
  );

  -- ====================================================================
  -- T10: Future legacy edited to 5d ago WITH reason → PASS
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000007';
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'UPDATE time_entries SET entry_date = CURRENT_DATE - 5, late_submission_reason = ''Corrigindo data futura legada para data retroativa valida'', updated_at = NOW() WHERE id = %L',
      v_id
    )),
    'T10: editing future to 5d ago with reason should PASS'
  );

  -- ====================================================================
  -- T11: Valid pending status-only approval does NOT rerun late validation
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000008';
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_id)),
    'T11: status-only approve of legacy retro should NOT trigger late validation'
  );

  -- ====================================================================
  -- T12: Valid pending status-only rejection → PASS
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000009';
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT public.reject_time_entry(%L, ''Rejeitando entrada retroativa legada via status-only'')', v_id)),
    'T12: status-only reject of legacy retro should PASS'
  );

  -- ====================================================================
  -- T13: Create tomorrow → DENIED
  -- ====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, CURRENT_DATE + 1, 480, ''T13 should be denied future'', ''pending'', 50.0)',
      v_proj, v_ana
    )),
    'T13: create tomorrow should DENIED'
  );

  -- ====================================================================
  -- T14: Create 7 days future → DENIED
  -- ====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, CURRENT_DATE + 7, 480, ''T14 should be denied 7d future'', ''pending'', 50.0)',
      v_proj, v_ana
    )),
    'T14: create 7d future should DENIED'
  );

  -- ====================================================================
  -- T15: Create 3d old without reason → DENIED
  -- ====================================================================
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, CURRENT_DATE - 3, 480, ''T15 should be denied no reason'', ''pending'', 50.0)',
      v_proj, v_ana
    )),
    'T15: create 3d old without reason should DENIED'
  );

  -- ====================================================================
  -- T16: Create 3d old WITH reason → PASS
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, CURRENT_DATE - 3, 480, ''T16 valid retroactive with reason'', ''pending'', 50.0, ''Trabalho realizado em campo com atraso na registracao'')',
      v_proj, v_ana
    )),
    'T16: create 3d old with reason should PASS'
  );

  -- ====================================================================
  -- T17: Batch approve: normal + future + normal → approved / failed / approved
  -- ====================================================================
  -- Create normal pending entries
  PERFORM pg_temp.try_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, CURRENT_DATE, 480, ''T17 batch normal 1'', ''pending'', 50.0)',
    v_proj, v_ana
  ));
  SELECT id INTO v_normal1 FROM time_entries WHERE description = 'T17 batch normal 1' ORDER BY created_at DESC LIMIT 1;

  PERFORM pg_temp.try_as(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (%L, %L, CURRENT_DATE - 1, 480, ''T17 batch normal 2'', ''pending'', 50.0)',
    v_proj, v_ana
  ));
  SELECT id INTO v_normal2 FROM time_entries WHERE description = 'T17 batch normal 2' ORDER BY created_at DESC LIMIT 1;

  v_batch_result := pg_temp.val_as(v_admin::text, format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM public.batch_approve_time_entries(ARRAY[%L::UUID, %L::UUID, %L::UUID])) t',
    v_normal1, 'cccc0000-0000-0000-0000-000000000010', v_normal2
  ))::JSONB;

  -- Find results by entry_id (order not guaranteed)
  PERFORM pg_temp.assert_true(
    (v_batch_result->0->>'status') = 'approved' OR (v_batch_result->1->>'status') = 'approved' OR (v_batch_result->2->>'status') = 'approved',
    'T17: at least one normal should be approved'
  );
  -- Find the failed entry (future legacy)
  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM jsonb_array_elements(v_batch_result) AS r WHERE r->>'status' = 'failed' AND (r->>'error') LIKE 'FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY%'),
    'T17: future should be failed with FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY'
  );
  -- Both normal entries should be approved
  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM jsonb_array_elements(v_batch_result) AS r WHERE r->>'entry_id' = v_normal1::text AND r->>'status' = 'approved'),
    'T17: first normal should be approved'
  );
  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM jsonb_array_elements(v_batch_result) AS r WHERE r->>'entry_id' = v_normal2::text AND r->>'status' = 'approved'),
    'T17: second normal should be approved'
  );

  -- ====================================================================
  -- T18: Batch reject future legacy → rejected
  -- ====================================================================
  v_batch_result := pg_temp.val_as(v_admin::text, format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM public.batch_reject_time_entries(ARRAY[%L::UUID], ''Rejeitando lote de entrada futura legada para correcao'')) t',
    'cccc0000-0000-0000-0000-000000000011'
  ))::JSONB;

  PERFORM pg_temp.assert_true(
    (v_batch_result->0->>'status') = 'rejected',
    'T18: batch reject future legacy should be rejected'
  );

  -- ====================================================================
  -- T19: Closed period behavior → unchanged
  -- ====================================================================
  v_id := 'cccc0000-0000-0000-0000-000000000012';
  v_period_key := to_char(CURRENT_DATE - 60, 'YYYY-MM');
  PERFORM pg_temp.try_as(v_admin::text, format('SELECT public.close_accounting_period(%L)', v_period_key));

  v_err := pg_temp.err_as(v_admin::text, format('SELECT public.approve_time_entry(%L)', v_id));
  PERFORM pg_temp.assert_true(
    v_err IS NOT NULL AND v_err LIKE '%closed accounting period%',
    'T19: approve in closed period should DENY'
  );

  -- Reopen for cleanup
  PERFORM pg_temp.try_as(v_admin::text, format('SELECT public.reopen_accounting_period(%L)', v_period_key));

  -- ====================================================================
  -- T20: Recurring future → denied
  -- ====================================================================
  v_err := pg_temp.err_as(v_admin::text, 'SELECT public.process_recurring_time_entries(CURRENT_DATE + 7)');
  PERFORM pg_temp.assert_true(
    v_err IS NOT NULL AND v_err LIKE 'FOCONFLOW_RECURRING_FUTURE%',
    'T20: recurring future date should DENY with FOCONFLOW_RECURRING_FUTURE'
  );

  RAISE NOTICE 'ALL TIME ENTRY APPROVAL TEMPORAL REGRESSION TESTS PASSED (T1-T20)';
END;
$$;

-- ====================================================================
-- Cleanup: remove all test entries to avoid interfering with other tests
-- ====================================================================
SET session_replication_role = 'replica';
DELETE FROM time_entries WHERE id::TEXT LIKE 'cccc0000%';
DELETE FROM time_entries WHERE description LIKE 'T1 %' OR description LIKE 'T2 %' OR description LIKE 'T3 %' OR description LIKE 'T17 %';
DELETE FROM time_entry_approval_history WHERE time_entry_id::TEXT LIKE 'cccc0000%';
SET session_replication_role = 'origin';
