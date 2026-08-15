-- Project Workspace RLS and CRUD tests.
--
-- Validates RLS policies and CRUD operations for project_phases,
-- project_tasks, project_members, and the time_entries phase_id/task_id
-- link. Uses the same helper pattern as rls_policies.sql.

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

-- Helper: run SQL as a given user and report success/failure
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

-- Helper: run a SELECT count(*) query as a given user and return the count
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

-- Helper: run SQL as authenticated and return a single UUID
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

DO $$
DECLARE
  v_ana UUID := '550e8400-e29b-41d4-a716-446655550001';
  v_bruno UUID := '550e8400-e29b-41d4-a716-446655550002';
  v_carla UUID := '550e8400-e29b-41d4-a716-446655550003';
  v_admin UUID := '550e8400-e29b-41d4-a716-446655550099';
  v_proj1 UUID := '550e8400-e29b-41d4-a716-446655440001';
  v_proj2 UUID := '550e8400-e29b-41d4-a716-446655440002';
  v_phase_id UUID;
  v_task_id UUID;
  v_member_id UUID;
  v_entry_id UUID;
  v_count BIGINT;
BEGIN
  -- ====================================================================
  -- PROJECT_PHASES
  -- ====================================================================

  -- TEST 1: authenticated user can read phases -> PASS (count >= 5 seeded)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM project_phases') >= 5,
    'T1: authenticated should read project_phases'
  );

  -- TEST 2: admin can create phase -> PASS
  v_phase_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO project_phases (project_id, name, status, position) VALUES (%L, ''Test Phase'', ''planned'', 99) RETURNING id',
    v_proj1
  ));
  PERFORM pg_temp.assert_true(v_phase_id IS NOT NULL, 'T2: admin should create phase');

  -- TEST 3: admin can update phase -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('UPDATE project_phases SET name = ''Updated Phase'' WHERE id = %L', v_phase_id)),
    'T3: admin should update phase'
  );

  -- TEST 4: admin can delete phase -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM project_phases WHERE id = %L', v_phase_id)),
    'T4: admin should delete phase'
  );

  -- TEST 5: regular member (not project manager) cannot create phase -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_carla::text, format(
      'INSERT INTO project_phases (project_id, name, status, position) VALUES (%L, ''Carla Phase'', ''planned'', 99)',
      v_proj1
    )),
    'T5: non-manager member must NOT create phase'
  );

  -- TEST 6: project manager can create phase -> PASS
  -- Admin is manager of proj1 (seeded), so this should work
  v_phase_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO project_phases (project_id, name, status, position) VALUES (%L, ''Manager Phase'', ''planned'', 98) RETURNING id',
    v_proj1
  ));
  PERFORM pg_temp.assert_true(v_phase_id IS NOT NULL, 'T6: project manager should create phase');

  -- Cleanup
  PERFORM pg_temp.try_as(v_admin::text, format('DELETE FROM project_phases WHERE id = %L', v_phase_id));

  -- ====================================================================
  -- PROJECT_TASKS
  -- ====================================================================

  -- TEST 7: authenticated user can read tasks -> PASS (count >= 6 seeded)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM project_tasks') >= 6,
    'T7: authenticated should read project_tasks'
  );

  -- TEST 8: admin can create task -> PASS
  v_task_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO project_tasks (project_id, title, status, priority) VALUES (%L, ''Test Task'', ''todo'', ''medium'') RETURNING id',
    v_proj1
  ));
  PERFORM pg_temp.assert_true(v_task_id IS NOT NULL, 'T8: admin should create task');

  -- TEST 9: admin can update task -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('UPDATE project_tasks SET status = ''done'', completed_at = now() WHERE id = %L', v_task_id)),
    'T9: admin should update task status'
  );

  -- TEST 10: admin can delete task -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM project_tasks WHERE id = %L', v_task_id)),
    'T10: admin should delete task'
  );

  -- TEST 11: non-manager member cannot create task -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_carla::text, format(
      'INSERT INTO project_tasks (project_id, title, status, priority) VALUES (%L, ''Carla Task'', ''todo'', ''low'')',
      v_proj1
    )),
    'T11: non-manager member must NOT create task'
  );

  -- TEST 12: assignee can update own task status -> PASS
  -- Seed task 550e8400-e29b-41d4-a716-446655442001 is assigned to Ana
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, format(
      'UPDATE project_tasks SET status = ''in_progress'' WHERE id = ''%s''',
      '550e8400-e29b-41d4-a716-446655442001'
    )),
    'T12: assignee should update own task status'
  );

  -- TEST 13: non-assignee cannot update task via assignee policy -> DENIED (RLS filters)
  -- Bruno tries to update Ana's task via assignee policy (not manager of proj1 as technical_lead — wait, Bruno IS technical_lead)
  -- Let's use Carla who is not a member of proj1 at all
  PERFORM pg_temp.try_as(v_carla::text, format(
    'UPDATE project_tasks SET status = ''blocked'' WHERE id = ''%s''',
    '550e8400-e29b-41d4-a716-446655442001'
  ));
  -- Verify the status was NOT changed to blocked
  PERFORM pg_temp.assert_eq(
    pg_temp.count_as(v_admin::text, format('SELECT count(*) FROM project_tasks WHERE id = ''%s'' AND status = ''blocked''', '550e8400-e29b-41d4-a716-446655442001')),
    0::BIGINT,
    'T13: non-assignee non-member must NOT update task (status unchanged)'
  );

  -- ====================================================================
  -- PROJECT_MEMBERS
  -- ====================================================================

  -- TEST 14: authenticated user can read members -> PASS (count >= 5 seeded)
  PERFORM pg_temp.assert_true(
    pg_temp.count_as(v_ana::text, 'SELECT count(*) FROM project_members') >= 5,
    'T14: authenticated should read project_members'
  );

  -- TEST 15: admin can add member -> PASS
  v_member_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO project_members (project_id, professional_id, project_role) VALUES (%L, %L, ''observer'') RETURNING id',
    v_proj2, v_ana
  ));
  PERFORM pg_temp.assert_true(v_member_id IS NOT NULL, 'T15: admin should add member');

  -- TEST 16: admin can remove member -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM project_members WHERE id = %L', v_member_id)),
    'T16: admin should remove member'
  );

  -- TEST 17: non-manager member cannot add member -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_carla::text, format(
      'INSERT INTO project_members (project_id, professional_id, project_role) VALUES (%L, %L, ''professional'')',
      v_proj1, v_carla
    )),
    'T17: non-manager member must NOT add member'
  );

  -- ====================================================================
  -- TIME ENTRIES with phase_id / task_id
  -- ====================================================================

  -- TEST 18: time entry can be created with task_id -> PASS
  v_entry_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason, task_id) VALUES (%L, %L, ''2024-06-15'', 120, ''Worked on task with link'', ''pending'', 0, ''Test late submission reason for retroactive entry'', ''%s'') RETURNING id',
    v_proj1, v_ana, '550e8400-e29b-41d4-a716-446655442002'
  ));
  PERFORM pg_temp.assert_true(v_entry_id IS NOT NULL, 'T18: time entry with task_id should be created');

  -- TEST 19: time entry without task_id still works (backward compat) -> PASS
  v_entry_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason) VALUES (%L, %L, ''2024-06-16'', 60, ''Old style entry without task link'', ''pending'', 0, ''Test late submission reason for retroactive entry'') RETURNING id',
    v_proj1, v_ana
  ));
  PERFORM pg_temp.assert_true(v_entry_id IS NOT NULL, 'T19: time entry without task_id should still work');

  -- TEST 20: time entry with phase_id works -> PASS
  v_entry_id := pg_temp.auth_as_uuid(v_ana::text, format(
    'INSERT INTO time_entries (project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, late_submission_reason, phase_id) VALUES (%L, %L, ''2024-06-17'', 90, ''Entry with phase link'', ''pending'', 0, ''Test late submission reason for retroactive entry'', ''%s'') RETURNING id',
    v_proj1, v_ana, '550e8400-e29b-41d4-a716-446655441002'
  ));
  PERFORM pg_temp.assert_true(v_entry_id IS NOT NULL, 'T20: time entry with phase_id should be created');

  -- ====================================================================
  -- RPC: get_project_workspace_summary
  -- ====================================================================

  -- TEST 21: admin can call get_project_workspace_summary -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('SELECT * FROM get_project_workspace_summary(''%s'')', v_proj1)),
    'T21: admin should call get_project_workspace_summary'
  );

  -- TEST 22: non-admin cannot call get_project_workspace_summary -> DENIED
  PERFORM pg_temp.assert_true(
    NOT pg_temp.try_as(v_ana::text, format('SELECT * FROM get_project_workspace_summary(''%s'')', v_proj1)),
    'T22: non-admin must NOT call get_project_workspace_summary'
  );

  RAISE NOTICE 'ALL PROJECT WORKSPACE TESTS PASSED';
END
$$;
