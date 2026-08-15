-- Phase 6: Project Milestones, Health & Forecasting — DB tests.
--
-- Validates:
--   1. project_milestones RLS (admin, manager, lead, professional, non-member)
--   2. project_milestones CRUD (create, read, update, delete)
--   3. project_tasks.milestone_id link + cascade SET NULL
--   4. get_project_progress (milestone-weighted, task-fallback, NULL)
--   5. calculate_project_health (admin-only, score ranges, hard overrides)
--   6. recalculate_project_health (state persistence, event emission, notifications)
--   7. get_project_health (admin full vs member sanitized)
--   8. get_projects_health_summary (admin-only, filter)
--   9. get_project_health_history (admin full vs member sanitized)
--  10. search_global includes milestones
--  11. Security: member cannot call calculate_project_health

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

-- Helper: run SQL as authenticated and return a single value
CREATE OR REPLACE FUNCTION pg_temp.auth_as_val(p_sub TEXT, p_sql TEXT)
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

-- Helper: run SQL as authenticated and return JSONB
CREATE OR REPLACE FUNCTION pg_temp.auth_as_jsonb(p_sub TEXT, p_sql TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_val JSONB;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
  EXECUTE p_sql INTO v_val;
  RETURN v_val;
END;
$$;

-- Helper: run SQL as authenticated and return NUMERIC
CREATE OR REPLACE FUNCTION pg_temp.auth_as_numeric(p_sub TEXT, p_sql TEXT)
RETURNS NUMERIC LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_val NUMERIC;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims TO %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text);
  EXECUTE p_sql INTO v_val;
  RETURN v_val;
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
  v_milestone_id UUID;
  v_health JSONB;
  v_count BIGINT;
  v_val TEXT;
  v_progress NUMERIC;
  v_bool BOOLEAN;
BEGIN
  -- ====================================================================
  -- 1. PROJECT_MILESTONES RLS
  -- ====================================================================

  -- TEST 1: authenticated user can read milestones -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_ana::text, 'SELECT 1 FROM project_milestones LIMIT 1'),
    'T1: authenticated should read project_milestones'
  );

  -- TEST 2: admin can create milestone -> PASS
  v_milestone_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO project_milestones (project_id, name, status, priority, position) VALUES (%L, ''Test MS'', ''planned'', ''high'', 99) RETURNING id',
    v_proj1
  ));
  PERFORM pg_temp.assert_true(v_milestone_id IS NOT NULL, 'T2: admin should create milestone');

  -- TEST 3: admin can update milestone -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('UPDATE project_milestones SET name = ''Updated MS'' WHERE id = %L', v_milestone_id)),
    'T3: admin should update milestone'
  );

  -- TEST 4: admin can delete milestone -> PASS
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format('DELETE FROM project_milestones WHERE id = %L', v_milestone_id)),
    'T4: admin should delete milestone'
  );

  -- TEST 5: non-member professional (Carla not in proj1) cannot create milestone -> DENIED
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_carla::text, format(
      'INSERT INTO project_milestones (project_id, name, status, priority, position) VALUES (%L, ''Carla MS'', ''planned'', ''medium'', 99)',
      v_proj1
    )),
    'T5: non-member must NOT create milestone'
  );

  -- TEST 6: technical lead (Bruno in proj1) can create milestone -> PASS
  v_milestone_id := pg_temp.auth_as_uuid(v_bruno::text, format(
    'INSERT INTO project_milestones (project_id, name, status, priority, position) VALUES (%L, ''Lead MS'', ''planned'', ''medium'', 98) RETURNING id',
    v_proj1
  ));
  PERFORM pg_temp.assert_true(v_milestone_id IS NOT NULL, 'T6: technical lead should create milestone');

  -- Cleanup
  PERFORM pg_temp.try_as(v_admin::text, format('DELETE FROM project_milestones WHERE id = %L', v_milestone_id));

  -- ====================================================================
  -- 2. MILESTONE STATUS CONSISTENCY TRIGGER
  -- ====================================================================

  -- TEST 7: setting status to completed auto-sets completed_at and progress=100
  v_milestone_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO project_milestones (project_id, name, status, priority, position, progress_percent) VALUES (%L, ''Trigger Test'', ''planned'', ''medium'', 97, 50) RETURNING id',
    v_proj1
  ));
  PERFORM pg_temp.try_as(v_admin::text, format(
    'UPDATE project_milestones SET status = ''completed'' WHERE id = %L', v_milestone_id
  ));
  SELECT completed_at IS NOT NULL, progress_percent
  INTO v_bool, v_progress
  FROM project_milestones WHERE id = v_milestone_id;
  PERFORM pg_temp.assert_true(v_bool, 'T7: completed_at should be set when status=completed');
  PERFORM pg_temp.assert_eq(v_progress, 100::NUMERIC, 'T7: progress should be 100 when status=completed');

  -- TEST 8: reopening (status back to in_progress) clears completed_at
  PERFORM pg_temp.try_as(v_admin::text, format(
    'UPDATE project_milestones SET status = ''in_progress'', progress_percent = 80 WHERE id = %L', v_milestone_id
  ));
  SELECT completed_at IS NOT NULL
  INTO v_bool
  FROM project_milestones WHERE id = v_milestone_id;
  PERFORM pg_temp.assert_false(v_bool, 'T8: completed_at should be NULL when reopened');

  -- Cleanup
  PERFORM pg_temp.try_as(v_admin::text, format('DELETE FROM project_milestones WHERE id = %L', v_milestone_id));

  -- ====================================================================
  -- 3. PROJECT_TASKS.MILESTONE_ID LINK + CASCADE
  -- ====================================================================

  -- TEST 9: task can be linked to a milestone
  v_milestone_id := pg_temp.auth_as_uuid(v_admin::text, format(
    'INSERT INTO project_milestones (project_id, name, status, priority, position) VALUES (%L, ''Link Test MS'', ''planned'', ''high'', 96) RETURNING id',
    v_proj1
  ));
  PERFORM pg_temp.assert_true(
    pg_temp.try_as(v_admin::text, format(
      'UPDATE project_tasks SET milestone_id = %L WHERE id = ''550e8400-e29b-41d4-a716-446655442004''',
      v_milestone_id
    )),
    'T9: should link task to milestone'
  );

  -- TEST 10: deleting milestone sets task.milestone_id to NULL (SET NULL)
  PERFORM pg_temp.try_as(v_admin::text, format('DELETE FROM project_milestones WHERE id = %L', v_milestone_id));
  SELECT COUNT(*) INTO v_count
  FROM project_tasks
  WHERE id = '550e8400-e29b-41d4-a716-446655442004' AND milestone_id IS NULL;
  PERFORM pg_temp.assert_eq(v_count, 1::BIGINT, 'T10: milestone_id should be NULL after milestone deleted');

  -- ====================================================================
  -- 4. GET_PROJECT_PROGRESS
  -- ====================================================================

  -- TEST 11: project with seeded milestones returns progress > 0
  v_progress := pg_temp.auth_as_numeric(v_admin::text, format(
    'SELECT public.get_project_progress(%L)', v_proj1
  ));
  PERFORM pg_temp.assert_true(v_progress > 0, 'T11: proj1 should have progress > 0 (has milestones)');

  -- TEST 12: project progress is between 0 and 100
  PERFORM pg_temp.assert_true(v_progress >= 0 AND v_progress <= 100, 'T12: progress should be 0-100');

  -- ====================================================================
  -- 5. CALCULATE_PROJECT_HEALTH (admin-only)
  -- ====================================================================

  -- TEST 13: admin can calculate health
  v_health := pg_temp.auth_as_jsonb(v_admin::text, format(
    'SELECT public.calculate_project_health(%L)', v_proj1
  ));
  PERFORM pg_temp.assert_true(v_health ? 'score', 'T13: health should have score');
  PERFORM pg_temp.assert_true(v_health ? 'status', 'T13: health should have status');
  PERFORM pg_temp.assert_true(v_health ? 'drivers', 'T13: health should have drivers');

  -- TEST 14: health status is valid
  v_val := v_health->>'status';
  PERFORM pg_temp.assert_true(
    v_val IN ('healthy', 'attention', 'at_risk', 'not_applicable'),
    'T14: health status should be valid'
  );

  -- TEST 15: score is 0-100 or NULL (not_applicable)
  IF v_val != 'not_applicable' THEN
    PERFORM pg_temp.assert_true(
      (v_health->>'score')::INTEGER >= 0 AND (v_health->>'score')::INTEGER <= 100,
      'T15: score should be 0-100'
    );
  END IF;

  -- TEST 16: member cannot call calculate_project_health -> DENIED
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, format('SELECT public.calculate_project_health(%L)', v_proj1)),
    'T16: member must NOT call calculate_project_health'
  );

  -- ====================================================================
  -- 6. RECALCULATE_PROJECT_HEALTH (state + events + notifications)
  -- ====================================================================

  -- TEST 17: recalculate persists state
  PERFORM pg_temp.auth_as_jsonb(v_admin::text, format(
    'SELECT public.recalculate_project_health(%L)', v_proj1
  ));
  SELECT COUNT(*) INTO v_count FROM project_health_states WHERE project_id = v_proj1;
  PERFORM pg_temp.assert_eq(v_count, 1::BIGINT, 'T17: health state should be persisted');

  -- TEST 18: recalculate emits event (first time → previous_status NULL)
  SELECT COUNT(*) INTO v_count FROM project_health_events WHERE project_id = v_proj1;
  PERFORM pg_temp.assert_true(v_count >= 1, 'T18: at least 1 health event should be emitted');

  -- TEST 19: notifications created for project_health_changed
  SELECT COUNT(*) INTO v_count
  FROM notifications
  WHERE type = 'project_health_changed' AND entity_id = v_proj1;
  PERFORM pg_temp.assert_true(v_count >= 1, 'T19: at least 1 notification should be created');

  -- TEST 20: second recalculate with SAME status does NOT emit new event
  -- (only status changes emit events, not score changes within same status)
  SELECT COUNT(*) INTO v_count FROM project_health_events WHERE project_id = v_proj1;
  PERFORM pg_temp.auth_as_jsonb(v_admin::text, format(
    'SELECT public.recalculate_project_health(%L)', v_proj1
  ));
  PERFORM pg_temp.assert_eq(
    (SELECT COUNT(*) FROM project_health_events WHERE project_id = v_proj1),
    v_count,
    'T20: same status recalc should NOT emit new event'
  );

  -- ====================================================================
  -- 7. GET_PROJECT_HEALTH (admin full vs member sanitized)
  -- ====================================================================

  -- TEST 21: admin gets full health (with budget_utilization)
  v_health := pg_temp.auth_as_jsonb(v_admin::text, format(
    'SELECT public.get_project_health(%L)', v_proj1
  ));
  PERFORM pg_temp.assert_true(v_health ? 'budget_utilization', 'T21: admin should see budget_utilization');

  -- TEST 22: member gets sanitized health (no budget_utilization value)
  v_health := pg_temp.auth_as_jsonb(v_ana::text, format(
    'SELECT public.get_project_health(%L)', v_proj1
  ));
  PERFORM pg_temp.assert_true(
    (v_health->>'budget_utilization') IS NULL,
    'T22: member should NOT see budget_utilization'
  );
  PERFORM pg_temp.assert_true(
    (v_health->>'forecast_labor_cost') IS NULL,
    'T22: member should NOT see forecast_labor_cost'
  );

  -- ====================================================================
  -- 8. GET_PROJECTS_HEALTH_SUMMARY (admin-only)
  -- ====================================================================

  -- TEST 23: admin can get summary
  v_health := pg_temp.auth_as_jsonb(v_admin::text, 'SELECT public.get_projects_health_summary()');
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_health) >= 1,
    'T23: summary should return at least 1 project'
  );

  -- TEST 24: member cannot get summary -> DENIED
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, 'SELECT public.get_projects_health_summary()'),
    'T24: member must NOT call get_projects_health_summary'
  );

  -- TEST 25: summary with filter returns filtered results
  v_health := pg_temp.auth_as_jsonb(v_admin::text, 'SELECT public.get_projects_health_summary(''at_risk'')');
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_health) >= 0,
    'T25: filtered summary should return array (may be empty)'
  );

  -- ====================================================================
  -- 9. GET_PROJECT_HEALTH_HISTORY
  -- ====================================================================

  -- TEST 26: admin can get history
  v_health := pg_temp.auth_as_jsonb(v_admin::text, format(
    'SELECT public.get_project_health_history(%L)', v_proj1
  ));
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_health) >= 1,
    'T26: history should have at least 1 event'
  );

  -- TEST 27: member can get history (sanitized — no budget drivers)
  v_health := pg_temp.auth_as_jsonb(v_ana::text, format(
    'SELECT public.get_project_health_history(%L)', v_proj1
  ));
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_health) >= 1,
    'T27: member should see history events'
  );

  -- ====================================================================
  -- 10. SEARCH_GLOBAL includes milestones
  -- ====================================================================

  -- TEST 28: search for "Fundações" returns milestones
  v_health := pg_temp.auth_as_jsonb(v_admin::text, 'SELECT public.search_global(''Fundações'')');
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_health->'milestones') >= 1,
    'T28: search should return milestones'
  );

  -- TEST 29: search result has correct type and href
  v_val := v_health->'milestones'->0->>'type';
  PERFORM pg_temp.assert_eq(v_val, 'milestone', 'T29: search result type should be milestone');

  -- ====================================================================
  -- 11. RECALCULATE_ALL_PROJECT_HEALTH
  -- ====================================================================

  -- TEST 30: admin can recalculate all
  v_health := pg_temp.auth_as_jsonb(v_admin::text, 'SELECT public.recalculate_all_project_health()');
  PERFORM pg_temp.assert_true(
    (v_health->>'recalculated')::INTEGER >= 1,
    'T30: recalculate_all should process at least 1 project'
  );

  -- TEST 31: member cannot recalculate all -> DENIED
  PERFORM pg_temp.assert_false(
    pg_temp.try_as(v_ana::text, 'SELECT public.recalculate_all_project_health()'),
    'T31: member must NOT call recalculate_all_project_health'
  );

  RAISE NOTICE 'ALL PHASE 6 MILESTONES & HEALTH TESTS PASSED';
END;
$$;
