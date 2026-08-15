-- Test suite for migration 20240823: time entry temporal rules.
-- Covers scenarios T1-T15 from the operational consistency spec.
--
-- Rules tested:
--   T1:  professional today → PASS
--   T2:  professional tomorrow → DENIED
--   T3:  professional +7 days future → DENIED
--   T4:  professional yesterday, no reason → PASS
--   T5:  professional 2 days ago, no reason → PASS
--   T6:  professional 3 days ago, no reason → DENIED
--   T7:  professional 3 days ago, valid reason → PASS
--   T8:  10 days ago, valid reason, period open → PASS
--   T9:  10 days ago, valid reason, period closed → DENIED
--   T10: whitespace-only reason → DENIED
--   T11: reason < 10 chars → DENIED
--   T12: edit pending to future date → DENIED
--   T13: edit pending to retro >=3 without reason → DENIED
--   T14: recurring future date → does not create future time_entry
--   T15: admin retroactive behavior (admin also needs reason)

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
-- succeeded (TRUE) or raised (FALSE). Checks for specific error prefix.
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

-- Helper: run SQL as a given user and check it raises with a specific error code prefix
CREATE OR REPLACE FUNCTION pg_temp.try_as_expect_error(p_sub TEXT, p_sql TEXT, p_err_prefix TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_err TEXT;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
    EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err ILIKE p_err_prefix || '%' THEN
      RETURN TRUE;
    END IF;
    -- Wrong error — re-raise so we can see it
    RAISE EXCEPTION 'Expected error prefix %, got: %', p_err_prefix, v_err;
  END;
  -- No error raised when one was expected
  RETURN FALSE;
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

-- Helper: run SQL with the closed-period delete trigger disabled (for cleanup).
CREATE OR REPLACE FUNCTION pg_temp.pg_role(p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE 'ALTER TABLE public.time_entries DISABLE TRIGGER trg_enforce_closed_period_delete';
  EXECUTE 'ALTER TABLE public.time_entries DISABLE TRIGGER trg_a_enforce_temporal_update';
  EXECUTE p_sql;
  EXECUTE 'ALTER TABLE public.time_entries ENABLE TRIGGER trg_a_enforce_temporal_update';
  EXECUTE 'ALTER TABLE public.time_entries ENABLE TRIGGER trg_enforce_closed_period_delete';
END;
$$;

-- Constants and main test block
DO $$
DECLARE
  v_admin UUID;
  v_ana UUID;
  v_proj UUID;
  v_today DATE;
  v_tomorrow DATE;
  v_yesterday DATE;
  v_2days_ago DATE;
  v_3days_ago DATE;
  v_10days_ago DATE;
  v_entry_id UUID;
  v_count INTEGER;
BEGIN
  -- Resolve test users from seed data
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_ana FROM profiles WHERE full_name = 'Ana Silva' LIMIT 1;
  SELECT id INTO v_proj FROM projects LIMIT 1;

  -- Compute test dates
  v_today := CURRENT_DATE;
  v_tomorrow := v_today + 1;
  v_yesterday := v_today - 1;
  v_2days_ago := v_today - 2;
  v_3days_ago := v_today - 3;
  v_10days_ago := v_today - 10;

  -- Clean up any existing entries for Ana in the test date range
  PERFORM pg_temp.pg_role(format(
    'DELETE FROM time_entries WHERE professional_id = ''%s'' AND entry_date >= ''%s'' AND entry_date <= ''%s''',
    v_ana, v_10days_ago, v_tomorrow
  ));

  -- ========================================================================
  -- T1: professional today → PASS
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (''%s'', ''%s'', ''%s'', 60, ''T1 today entry test'', ''pending'', 120)',
      v_proj, v_ana, v_today
    )),
    'T1: professional should be able to create entry for today'
  );

  -- ========================================================================
  -- T2: professional tomorrow → DENIED
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_ana::text,
      format(
        'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (''%s'', ''%s'', ''%s'', 60, ''T2 future entry test'', ''pending'', 120)',
        v_proj, v_ana, v_tomorrow
      ),
      'FOCONFLOW_FUTURE_DATE'
    ),
    'T2: professional should NOT create entry for tomorrow (future date)'
  );

  -- ========================================================================
  -- T3: professional +7 days future → DENIED
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_ana::text,
      format(
        'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (''%s'', ''%s'', ''%s'', 60, ''T3 future entry test seven days'', ''pending'', 120)',
        v_proj, v_ana, v_today + 7
      ),
      'FOCONFLOW_FUTURE_DATE'
    ),
    'T3: professional should NOT create entry 7 days in the future'
  );

  -- ========================================================================
  -- T4: professional yesterday, no reason → PASS
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (''%s'', ''%s'', ''%s'', 60, ''T4 yesterday entry test'', ''pending'', 120)',
      v_proj, v_ana, v_yesterday
    )),
    'T4: professional should create entry for yesterday without reason'
  );

  -- ========================================================================
  -- T5: professional 2 days ago, no reason → PASS
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (''%s'', ''%s'', ''%s'', 60, ''T5 two days ago entry test'', ''pending'', 120)',
      v_proj, v_ana, v_2days_ago
    )),
    'T5: professional should create entry 2 days ago without reason'
  );

  -- ========================================================================
  -- T6: professional 3 days ago, no reason → DENIED
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_ana::text,
      format(
        'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (''%s'', ''%s'', ''%s'', 60, ''T6 three days ago entry'', ''pending'', 120)',
        v_proj, v_ana, v_3days_ago
      ),
      'FOCONFLOW_LATE_JUSTIFICATION'
    ),
    'T6: professional should NOT create entry 3 days ago without reason'
  );

  -- ========================================================================
  -- T7: professional 3 days ago, valid reason → PASS
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (''%s'', ''%s'', ''%s'', 60, ''T7 three days ago with reason'', ''pending'', 120, ''Estava em campo e não pude registrar no tempo adequado.'')',
      v_proj, v_ana, v_3days_ago
    )),
    'T7: professional should create entry 3 days ago with valid reason'
  );

  -- ========================================================================
  -- T8: 10 days ago, valid reason, period open → PASS
  -- ========================================================================
  -- First ensure the period for 10 days ago is NOT closed
  PERFORM pg_temp.pg_role(format(
    'DELETE FROM accounting_periods WHERE period_key = ''%s''',
    to_char(v_10days_ago, 'YYYY-MM')
  ));

  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (''%s'', ''%s'', ''%s'', 60, ''T8 ten days ago with valid reason'', ''pending'', 120, ''Trabalho externo prolongado sem acesso ao sistema para registro.'')',
      v_proj, v_ana, v_10days_ago
    )),
    'T8: professional should create entry 10 days ago with valid reason (period open)'
  );

  -- ========================================================================
  -- T9: 10 days ago, valid reason, period closed → DENIED
  -- ========================================================================
  -- Close the period for 10 days ago
  PERFORM pg_temp.pg_role(format(
    'INSERT INTO accounting_periods (period_key, status, closed_by, closed_at) VALUES (''%s'', ''closed'', ''%s'', now()) ON CONFLICT (period_key) DO UPDATE SET status = ''closed'', closed_by = ''%s'', closed_at = now()',
    to_char(v_10days_ago, 'YYYY-MM'), v_admin, v_admin
  ));

  -- Try to insert — should be denied by closed period (not by late justification)
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (''%s'', ''%s'', ''%s'', 60, ''T9 ten days ago closed period test'', ''pending'', 120, ''Trabalho externo prolongado sem acesso ao sistema.'')',
      v_proj, v_ana, v_10days_ago
    )),
    'T9: professional should NOT create entry in closed period even with reason'
  );

  -- Reopen the period for cleanup
  PERFORM pg_temp.pg_role(format(
    'DELETE FROM accounting_periods WHERE period_key = ''%s''',
    to_char(v_10days_ago, 'YYYY-MM')
  ));

  -- ========================================================================
  -- T10: whitespace-only reason → DENIED
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_ana::text,
      format(
        'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (''%s'', ''%s'', ''%s'', 60, ''T10 whitespace reason test entry'', ''pending'', 120, ''     '')',
        v_proj, v_ana, v_3days_ago
      ),
      'FOCONFLOW_LATE_JUSTIFICATION'
    ),
    'T10: whitespace-only reason should be rejected'
  );

  -- ========================================================================
  -- T11: reason < 10 chars → DENIED
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_ana::text,
      format(
        'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (''%s'', ''%s'', ''%s'', 60, ''T11 short reason test entry'', ''pending'', 120, ''curto'')',
        v_proj, v_ana, v_3days_ago
      ),
      'FOCONFLOW_LATE_JUSTIFICATION'
    ),
    'T11: reason shorter than 10 chars should be rejected'
  );

  -- ========================================================================
  -- T12: edit pending to future date → DENIED
  -- ========================================================================
  -- Use the T1 entry (today, pending) and try to change to tomorrow
  SELECT id INTO v_entry_id FROM time_entries
    WHERE professional_id = v_ana AND description = 'T1 today entry test'
    ORDER BY created_at DESC LIMIT 1;

  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_ana::text,
      format(
        'UPDATE time_entries SET entry_date = ''%s'' WHERE id = ''%s''',
        v_tomorrow, v_entry_id
      ),
      'FOCONFLOW_FUTURE_DATE'
    ),
    'T12: editing pending entry to future date should be denied'
  );

  -- ========================================================================
  -- T13: edit pending to retro >=3 without reason → DENIED
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_ana::text,
      format(
        'UPDATE time_entries SET entry_date = ''%s'' WHERE id = ''%s''',
        v_3days_ago, v_entry_id
      ),
      'FOCONFLOW_LATE_JUSTIFICATION'
    ),
    'T13: editing pending entry to 3+ days ago without reason should be denied'
  );

  -- Edit with reason should pass
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'UPDATE time_entries SET entry_date = ''%s'', late_submission_reason = ''Motivo válido para alteração de data retroativa.'' WHERE id = ''%s''',
      v_3days_ago, v_entry_id
    )),
    'T13b: editing pending entry to 3+ days ago WITH reason should pass'
  );

  -- ========================================================================
  -- T14: recurring future date → does not create future time_entry
  -- ========================================================================
  -- Create a recurring rule with next_run_date in the future
  PERFORM pg_temp.user_as(v_ana::text, format(
    'INSERT INTO recurring_time_entry_rules (professional_id, project_id, description, duration_minutes, frequency, start_date, next_run_date, is_active) VALUES (''%s'', ''%s'', ''T14 recurring future test rule'', 60, ''daily'', ''%s'', ''%s'', TRUE)',
    v_ana, v_proj, v_today, v_tomorrow
  ));

  -- Call process_recurring_time_entries with today — should NOT create entry
  -- because next_run_date (tomorrow) > p_run_date (today)
  PERFORM pg_temp.pg_role('SELECT * FROM public.process_recurring_time_entries(''' || v_today || '''::DATE)');

  -- Verify no entry was created for tomorrow
  SELECT count(*) INTO v_count FROM time_entries
    WHERE professional_id = v_ana AND entry_date = v_tomorrow;
  PERFORM pg_temp.assert_eq(v_count, 0, 'T14: recurring should NOT create future time_entry');

  -- Also test calling with a future p_run_date — should raise exception
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_admin::text,
      'SELECT * FROM public.process_recurring_time_entries(''' || v_tomorrow || '''::DATE)'
    ),
    'T14b: process_recurring with future date should be denied'
  );

  -- Clean up the recurring rule
  PERFORM pg_temp.user_as(v_ana::text, format(
    'DELETE FROM recurring_time_entry_rules WHERE description = ''T14 recurring future test rule'''
  ));

  -- ========================================================================
  -- T15: admin retroactive behavior — admin also needs reason for 3+ days
  -- ========================================================================
  PERFORM pg_temp.assert_true(
    pg_temp.try_as_expect_error(v_admin::text,
      format(
        'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate) VALUES (''%s'', ''%s'', ''%s'', 60, ''T15 admin retroactive without reason test'', ''pending'', 120)',
        v_proj, v_ana, v_3days_ago
      ),
      'FOCONFLOW_LATE_JUSTIFICATION'
    ),
    'T15: admin should also need reason for retroactive 3+ days entry'
  );

  -- Admin WITH reason should pass
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format(
      'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (''%s'', ''%s'', ''%s'', 60, ''T15 admin retroactive with reason test'', ''pending'', 120, ''Lançamento administrativo retroativo com justificativa válida.'')',
      v_proj, v_ana, v_3days_ago
    )),
    'T15b: admin should create retroactive entry with valid reason'
  );

  -- ========================================================================
  -- CLEANUP
  -- ========================================================================
  PERFORM pg_temp.pg_role(format(
    'DELETE FROM time_entries WHERE professional_id = ''%s'' AND entry_date >= ''%s'' AND entry_date <= ''%s''',
    v_ana, v_10days_ago, v_tomorrow
  ));

  RAISE NOTICE 'ALL TIME ENTRY TEMPORAL RULES TESTS PASSED';
END;
$$;
