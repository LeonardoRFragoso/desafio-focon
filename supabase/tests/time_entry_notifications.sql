-- Time entry submission notifications + comment notifications tests.
--
-- Validates:
--   1. Creating a pending entry generates entry_submitted notification for admins
--   2. No duplicate admin notifications (one per admin per entry)
--   3. Approved/rejected notifications still work for employees
--   4. Member cannot read another member's time entry
--   5. Admin can read all time entries
--   6. Member cannot manipulate another user's comments
--   7. Phase/task linkage works on time entries
--   8. Approval history remains correct
--   9. Comment notification sent to entry owner (not author)
--  10. No self-notification on own comment

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

-- Helper: count notifications as postgres (bypass RLS)
CREATE OR REPLACE FUNCTION pg_temp.count_notifications(p_type TEXT, p_user_id UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications
  WHERE type = p_type AND user_id = p_user_id;
  RETURN v_count;
END;
$$;

DO $$
DECLARE
  v_ana UUID := '550e8400-e29b-41d4-a716-446655550001';
  v_bruno UUID := '550e8400-e29b-41d4-a716-446655550002';
  v_carla UUID := '550e8400-e29b-41d4-a716-446655550003';
  v_admin UUID := '550e8400-e29b-41d4-a716-446655550099';
  v_proj1 UUID := '550e8400-e29b-41d4-a716-446655440001';
  v_entry_id UUID;
  v_entry_id2 UUID;
  v_comment_id UUID;
  v_count BIGINT;
  v_before_count BIGINT;
  v_after_count BIGINT;
BEGIN
  -- ====================================================================
  -- TEST 1: Creating pending entry generates entry_submitted for admin
  -- ====================================================================
  v_before_count := pg_temp.count_notifications('entry_submitted', v_admin);
  v_entry_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, ''2024-09-15'', 90, ''Test notification entry'', ''pending'', 0, ''Test late submission reason for retroactive entry'') RETURNING id',
    v_proj1, v_ana
  ));
  v_after_count := pg_temp.count_notifications('entry_submitted', v_admin);
  PERFORM pg_temp.assert_true(v_after_count > v_before_count, 'T1: admin should receive entry_submitted notification');
  PERFORM pg_temp.assert_true(v_entry_id IS NOT NULL, 'T1: entry should be created');

  -- ====================================================================
  -- TEST 2: No duplicate admin notifications (one per admin per entry)
  -- ====================================================================
  -- The entry was created once, so exactly one notification should have been added
  PERFORM pg_temp.assert_eq(v_after_count - v_before_count, 1::BIGINT, 'T2: exactly one notification per entry per admin');

  -- ====================================================================
  -- TEST 3: Approved/rejected notification still works for employee
  -- ====================================================================
  v_before_count := pg_temp.count_notifications('entry_approved', v_ana);
  PERFORM pg_temp.try_as(v_admin::text, format('SELECT approve_time_entry(''%s'')', v_entry_id));
  v_after_count := pg_temp.count_notifications('entry_approved', v_ana);
  PERFORM pg_temp.assert_true(v_after_count > v_before_count, 'T3: employee should receive entry_approved notification');

  -- Test rejection notification
  v_entry_id2 := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, ''2024-09-15'', 60, ''Test rejection notification'', ''pending'', 0, ''Test late submission reason for retroactive entry'') RETURNING id',
    v_proj1, v_ana
  ));
  v_before_count := pg_temp.count_notifications('entry_rejected', v_ana);
  PERFORM pg_temp.try_as(v_admin::text, format('SELECT reject_time_entry(''%s'', ''Test rejection reason for notification'')', v_entry_id2));
  v_after_count := pg_temp.count_notifications('entry_rejected', v_ana);
  PERFORM pg_temp.assert_true(v_after_count > v_before_count, 'T3b: employee should receive entry_rejected notification');

  -- ====================================================================
  -- TEST 4: Member cannot read another member's time entry
  -- ====================================================================
  -- Ana creates an entry
  v_entry_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, ''2024-09-15'', 30, ''Cross-user visibility test'', ''pending'', 0, ''Test late submission reason for retroactive entry'') RETURNING id',
    v_proj1, v_ana
  ));
  -- Bruno tries to read Ana's entry
  v_count := pg_temp.count_as(v_bruno::text, format('SELECT count(*) FROM time_entries WHERE id = ''%s''', v_entry_id));
  PERFORM pg_temp.assert_eq(v_count, 0::BIGINT, 'T4: Bruno must NOT see Ana''s time entry');

  -- ====================================================================
  -- TEST 5: Admin can read all time entries
  -- ====================================================================
  v_count := pg_temp.count_as(v_admin::text, format('SELECT count(*) FROM time_entries WHERE id = ''%s''', v_entry_id));
  PERFORM pg_temp.assert_eq(v_count, 1::BIGINT, 'T5: admin should see all time entries');

  -- ====================================================================
  -- TEST 6: Member cannot manipulate another user's comments
  -- ====================================================================
  -- Ana creates a comment on her own entry
  v_comment_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entry_comments (time_entry_id, author_id, body) VALUES (''%s'', ''%s'', ''Ana''''s comment'') RETURNING id',
    v_entry_id, v_ana
  ));
  -- Bruno tries to delete Ana's comment (RLS filters silently, so check it still exists)
  PERFORM pg_temp.try_as(v_bruno::text, format('DELETE FROM time_entry_comments WHERE id = ''%s''', v_comment_id));
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_admin::text, format('SELECT count(*) FROM time_entry_comments WHERE id = ''%s''', v_comment_id)),
    1::BIGINT,
    'T6: Bruno must NOT delete Ana''s comment (still exists)'
  );
  -- Bruno tries to edit Ana's comment (RLS filters silently, so check body unchanged)
  PERFORM pg_temp.try_as(v_bruno::text, format('UPDATE time_entry_comments SET body = ''hacked'' WHERE id = ''%s''', v_comment_id));
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_admin::text, format('SELECT count(*) FROM time_entry_comments WHERE id = ''%s'' AND body = ''hacked''', v_comment_id)),
    0::BIGINT,
    'T6b: Bruno must NOT edit Ana''s comment (body unchanged)'
  );

  -- ====================================================================
  -- TEST 7: Phase/task linkage works on time entries
  -- ====================================================================
  v_entry_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason, phase_id, task_id) VALUES (%L, %L, ''2024-09-15'', 45, ''Entry with phase and task link'', ''pending'', 0, ''Test late submission reason for retroactive entry'', ''%s'', ''%s'') RETURNING id',
    v_proj1, v_ana, '550e8400-e29b-41d4-a716-446655441002', '550e8400-e29b-41d4-a716-446655442002'
  ));
  PERFORM pg_temp.assert_true(v_entry_id IS NOT NULL, 'T7: entry with phase_id and task_id should be created');

  -- ====================================================================
  -- TEST 8: Approval history remains correct
  -- ====================================================================
  v_count := pg_temp.count_as(v_admin::text, format(
    'SELECT count(*) FROM time_entry_approval_history WHERE time_entry_id = ''%s''', v_entry_id2
  ));
  -- Should have at least 1 history entry from the rejection in T3
  PERFORM pg_temp.assert_true(v_count >= 1, 'T8: approval history should have rejection record');

  -- ====================================================================
  -- TEST 9: Comment notification sent to entry owner (not author)
  -- ====================================================================
  -- Admin comments on Ana's entry → Ana should get comment_received notification
  v_before_count := pg_temp.count_notifications('comment_received', v_ana);
  PERFORM pg_temp.try_as(v_admin::text, format(
    'INSERT INTO time_entry_comments (time_entry_id, author_id, body) VALUES (''%s'', ''%s'', ''Admin comment for notification test'')',
    v_entry_id, v_admin
  ));
  v_after_count := pg_temp.count_notifications('comment_received', v_ana);
  PERFORM pg_temp.assert_true(v_after_count > v_before_count, 'T9: entry owner should receive comment_received notification');

  -- ====================================================================
  -- TEST 10: No self-notification on own comment
  -- ====================================================================
  -- Ana comments on her own entry → Ana should NOT get a notification
  v_before_count := pg_temp.count_notifications('comment_received', v_ana);
  PERFORM pg_temp.try_as(v_ana::text, format(
    'INSERT INTO time_entry_comments (time_entry_id, author_id, body) VALUES (''%s'', ''%s'', ''Ana commenting on own entry'')',
    v_entry_id, v_ana
  ));
  v_after_count := pg_temp.count_notifications('comment_received', v_ana);
  PERFORM pg_temp.assert_eq(v_after_count, v_before_count, 'T10: no self-notification on own comment');

  RAISE NOTICE 'ALL TIME ENTRY NOTIFICATION TESTS PASSED';
END
$$;
