-- Project Health Lifecycle — DB regression tests.
--
-- Validates the critical transition between active and terminal project
-- statuses (completed / cancelled) and the inverse (terminal -> active).
-- These scenarios previously broke because calculate_project_health_internal
-- returns score = NULL / status = 'not_applicable' for terminal projects,
-- but project_health_states.health_score and project_health_events.new_score
-- were declared NOT NULL. The AFTER UPDATE trigger
-- trg_recalc_health_project -> recalculate_project_health_internal therefore
-- raised a NOT NULL violation, which rolled back the entire UPDATE
-- transaction — meaning admins could NOT mark a project as completed or
-- cancelled.
--
-- Coverage (matches the audit matrix A..J):
--   A. active -> completed
--   B. active -> cancelled
--   C. completed -> active
--   D. cancelled -> active
--   E. recalculate_project_health() on completed
--   F. recalculate_project_health() on cancelled
--   G. recalculate_all_project_health() with mixed statuses
--   H. automatic trigger after status change
--   I. health events on not_applicable transitions
--   J. notifications not spammed on not_applicable transitions
--
-- All assertions verify FINAL STATE (row counts, persisted columns), not
-- just "statement did not throw".

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

DO $$
DECLARE
  v_admin UUID := '550e8400-e29b-41d4-a716-446655550099';
  -- Dedicated test projects (created fresh to avoid mutating seed data that
  -- other test files rely on). We insert them as superuser (RESET ROLE) so
  -- RLS does not block setup.
  v_proj_active    UUID := 'a1000000-0000-0000-0000-000000000001';
  v_proj_active2   UUID := 'a1000000-0000-0000-0000-000000000002';
  v_proj_completed UUID := 'a1000000-0000-0000-0000-000000000003';
  v_proj_cancelled UUID := 'a1000000-0000-0000-0000-000000000004';
  v_proj_mixed_a   UUID := 'a1000000-0000-0000-0000-000000000005';
  v_proj_mixed_p   UUID := 'a1000000-0000-0000-0000-000000000006';
  v_proj_mixed_c   UUID := 'a1000000-0000-0000-0000-000000000007';
  v_proj_mixed_x   UUID := 'a1000000-0000-0000-0000-000000000008';
  v_count BIGINT;
  v_health JSONB;
  v_status TEXT;
  v_score INTEGER;
  v_events_before BIGINT;
  v_notifs_before BIGINT;
  v_notifs_after BIGINT;
BEGIN
  -- ====================================================================
  -- SETUP: create isolated test projects (superuser context)
  -- ====================================================================
  EXECUTE 'RESET ROLE';

  INSERT INTO projects (id, name, client, status, start_date, end_date)
  VALUES
    (v_proj_active,    'Lifecycle Active 1',    'Test', 'active',    (CURRENT_DATE - INTERVAL '30 days')::DATE, (CURRENT_DATE + INTERVAL '30 days')::DATE),
    (v_proj_active2,   'Lifecycle Active 2',    'Test', 'active',    (CURRENT_DATE - INTERVAL '30 days')::DATE, (CURRENT_DATE + INTERVAL '30 days')::DATE),
    (v_proj_completed, 'Lifecycle Completed',   'Test', 'completed', (CURRENT_DATE - INTERVAL '60 days')::DATE, (CURRENT_DATE - INTERVAL '10 days')::DATE),
    (v_proj_cancelled, 'Lifecycle Cancelled',   'Test', 'cancelled', (CURRENT_DATE - INTERVAL '60 days')::DATE, (CURRENT_DATE - INTERVAL '10 days')::DATE),
    (v_proj_mixed_a,   'Lifecycle Mixed A',     'Test', 'active',    (CURRENT_DATE - INTERVAL '30 days')::DATE, (CURRENT_DATE + INTERVAL '30 days')::DATE),
    (v_proj_mixed_p,   'Lifecycle Mixed P',     'Test', 'planned',   CURRENT_DATE,                              (CURRENT_DATE + INTERVAL '60 days')::DATE),
    (v_proj_mixed_c,   'Lifecycle Mixed C',     'Test', 'completed', (CURRENT_DATE - INTERVAL '60 days')::DATE, (CURRENT_DATE - INTERVAL '10 days')::DATE),
    (v_proj_mixed_x,   'Lifecycle Mixed X',     'Test', 'cancelled', (CURRENT_DATE - INTERVAL '60 days')::DATE, (CURRENT_DATE - INTERVAL '10 days')::DATE)
  ON CONFLICT (id) DO NOTHING;

  -- Clean any pre-existing health state for our test projects
  DELETE FROM project_health_events WHERE project_id IN (v_proj_active, v_proj_active2, v_proj_completed, v_proj_cancelled, v_proj_mixed_a, v_proj_mixed_p, v_proj_mixed_c, v_proj_mixed_x);
  DELETE FROM project_health_states WHERE project_id IN (v_proj_active, v_proj_active2, v_proj_completed, v_proj_cancelled, v_proj_mixed_a, v_proj_mixed_p, v_proj_mixed_c, v_proj_mixed_x);
  DELETE FROM notifications WHERE type = 'project_health_changed' AND entity_id IN (v_proj_active, v_proj_active2, v_proj_completed, v_proj_cancelled, v_proj_mixed_a, v_proj_mixed_p, v_proj_mixed_c, v_proj_mixed_x);

  -- ====================================================================
  -- A. active -> completed (the original P0 scenario)
  -- ====================================================================
  -- Pre-seed a health state so the trigger's not_applicable branch runs and
  -- exercises the upsert path that previously violated NOT NULL.
  PERFORM public.recalculate_project_health_internal(v_proj_active);

  -- The UPDATE must succeed (no NOT NULL violation) and the project must
  -- actually be persisted as completed.
  UPDATE projects SET status = 'completed' WHERE id = v_proj_active;

  SELECT status INTO v_status FROM projects WHERE id = v_proj_active;
  PERFORM pg_temp.assert_eq(v_status, 'completed', 'A: project status must be completed after UPDATE');

  -- The health state must be persisted as not_applicable with NULL score.
  SELECT health_status, health_score INTO v_status, v_score
  FROM project_health_states WHERE project_id = v_proj_active;
  PERFORM pg_temp.assert_eq(v_status, 'not_applicable', 'A: health_status must be not_applicable');
  PERFORM pg_temp.assert_eq(v_score, NULL::INTEGER, 'A: health_score must be NULL for not_applicable');

  -- ====================================================================
  -- B. active -> cancelled
  -- ====================================================================
  PERFORM public.recalculate_project_health_internal(v_proj_active2);

  UPDATE projects SET status = 'cancelled' WHERE id = v_proj_active2;

  SELECT status INTO v_status FROM projects WHERE id = v_proj_active2;
  PERFORM pg_temp.assert_eq(v_status, 'cancelled', 'B: project status must be cancelled after UPDATE');

  SELECT health_status, health_score INTO v_status, v_score
  FROM project_health_states WHERE project_id = v_proj_active2;
  PERFORM pg_temp.assert_eq(v_status, 'not_applicable', 'B: health_status must be not_applicable');
  PERFORM pg_temp.assert_eq(v_score, NULL::INTEGER, 'B: health_score must be NULL for not_applicable');

  -- ====================================================================
  -- C. completed -> active (reopening)
  -- ====================================================================
  UPDATE projects SET status = 'active' WHERE id = v_proj_completed;

  SELECT status INTO v_status FROM projects WHERE id = v_proj_completed;
  PERFORM pg_temp.assert_eq(v_status, 'active', 'C: project status must be active after reopen');

  -- After reopening, health must be recalculated to a real score/status
  -- (not not_applicable, not NULL score).
  SELECT health_status, health_score INTO v_status, v_score
  FROM project_health_states WHERE project_id = v_proj_completed;
  PERFORM pg_temp.assert_true(
    v_status IN ('healthy', 'attention', 'at_risk'),
    'C: health_status must be a real status after reopen, got ' || COALESCE(v_status, 'NULL')
  );
  PERFORM pg_temp.assert_true(
    v_score IS NOT NULL AND v_score >= 0 AND v_score <= 100,
    'C: health_score must be a real 0-100 value after reopen'
  );

  -- ====================================================================
  -- D. cancelled -> active (reopening from cancelled)
  -- ====================================================================
  UPDATE projects SET status = 'active' WHERE id = v_proj_cancelled;

  SELECT status INTO v_status FROM projects WHERE id = v_proj_cancelled;
  PERFORM pg_temp.assert_eq(v_status, 'active', 'D: project status must be active after reopen from cancelled');

  SELECT health_status, health_score INTO v_status, v_score
  FROM project_health_states WHERE project_id = v_proj_cancelled;
  PERFORM pg_temp.assert_true(
    v_status IN ('healthy', 'attention', 'at_risk'),
    'D: health_status must be a real status after reopen from cancelled, got ' || COALESCE(v_status, 'NULL')
  );
  PERFORM pg_temp.assert_true(
    v_score IS NOT NULL AND v_score >= 0 AND v_score <= 100,
    'D: health_score must be a real 0-100 value after reopen from cancelled'
  );

  -- ====================================================================
  -- E. recalculate_project_health() (public admin RPC) on completed
  -- ====================================================================
  -- Reset proj_active (now completed) state and call the public RPC.
  EXECUTE 'RESET ROLE';
  DELETE FROM project_health_events WHERE project_id = v_proj_active;
  DELETE FROM project_health_states WHERE project_id = v_proj_active;

  v_health := pg_temp.auth_as_jsonb(v_admin::text, format(
    'SELECT public.recalculate_project_health(%L)', v_proj_active
  ));
  PERFORM pg_temp.assert_eq(
    v_health->>'status', 'not_applicable',
    'E: recalculate on completed must return not_applicable'
  );
  PERFORM pg_temp.assert_eq(
    (v_health->>'score')::TEXT, NULL::TEXT,
    'E: recalculate on completed must return NULL score'
  );

  SELECT health_status, health_score INTO v_status, v_score
  FROM project_health_states WHERE project_id = v_proj_active;
  PERFORM pg_temp.assert_eq(v_status, 'not_applicable', 'E: persisted health_status must be not_applicable');
  PERFORM pg_temp.assert_eq(v_score, NULL::INTEGER, 'E: persisted health_score must be NULL');

  -- ====================================================================
  -- F. recalculate_project_health() (public admin RPC) on cancelled
  -- ====================================================================
  EXECUTE 'RESET ROLE';
  DELETE FROM project_health_events WHERE project_id = v_proj_active2;
  DELETE FROM project_health_states WHERE project_id = v_proj_active2;

  v_health := pg_temp.auth_as_jsonb(v_admin::text, format(
    'SELECT public.recalculate_project_health(%L)', v_proj_active2
  ));
  PERFORM pg_temp.assert_eq(
    v_health->>'status', 'not_applicable',
    'F: recalculate on cancelled must return not_applicable'
  );
  PERFORM pg_temp.assert_eq(
    (v_health->>'score')::TEXT, NULL::TEXT,
    'F: recalculate on cancelled must return NULL score'
  );

  SELECT health_status, health_score INTO v_status, v_score
  FROM project_health_states WHERE project_id = v_proj_active2;
  PERFORM pg_temp.assert_eq(v_status, 'not_applicable', 'F: persisted health_status must be not_applicable');
  PERFORM pg_temp.assert_eq(v_score, NULL::INTEGER, 'F: persisted health_score must be NULL');

  -- ====================================================================
  -- G. recalculate_all_project_health() with mixed statuses
  -- (active, planned, completed, cancelled)
  -- ====================================================================
  EXECUTE 'RESET ROLE';
  DELETE FROM project_health_events WHERE project_id IN (v_proj_mixed_a, v_proj_mixed_p, v_proj_mixed_c, v_proj_mixed_x);
  DELETE FROM project_health_states WHERE project_id IN (v_proj_mixed_a, v_proj_mixed_p, v_proj_mixed_c, v_proj_mixed_x);

  v_health := pg_temp.auth_as_jsonb(v_admin::text, 'SELECT public.recalculate_all_project_health()');
  -- The batch must not error out on completed/cancelled projects.
  PERFORM pg_temp.assert_true(
    (v_health->>'recalculated')::INTEGER >= 1,
    'G: recalculate_all should process at least 1 project'
  );
  -- And there must be NO errors recorded for our mixed-status projects.
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_health->'errors') AS e
      WHERE (e->>'project_id')::UUID IN (v_proj_mixed_a, v_proj_mixed_p, v_proj_mixed_c, v_proj_mixed_x)
    ),
    'G: recalculate_all must not error on mixed-status projects'
  );

  -- Verify terminal projects got not_applicable, active/planned got real status.
  SELECT health_status INTO v_status FROM project_health_states WHERE project_id = v_proj_mixed_c;
  PERFORM pg_temp.assert_eq(v_status, 'not_applicable', 'G: mixed completed must be not_applicable');

  SELECT health_status INTO v_status FROM project_health_states WHERE project_id = v_proj_mixed_x;
  PERFORM pg_temp.assert_eq(v_status, 'not_applicable', 'G: mixed cancelled must be not_applicable');

  SELECT health_status INTO v_status FROM project_health_states WHERE project_id = v_proj_mixed_a;
  PERFORM pg_temp.assert_true(
    v_status IN ('healthy', 'attention', 'at_risk'),
    'G: mixed active must have a real status, got ' || COALESCE(v_status, 'NULL')
  );

  -- ====================================================================
  -- H. automatic trigger after status change (re-verify trigger path)
  -- ====================================================================
  -- Take the mixed planned project, transition to completed, and confirm
  -- the trigger alone (not a manual recalc) persisted not_applicable.
  UPDATE projects SET status = 'completed' WHERE id = v_proj_mixed_p;

  SELECT status INTO v_status FROM projects WHERE id = v_proj_mixed_p;
  PERFORM pg_temp.assert_eq(v_status, 'completed', 'H: project status must be completed via trigger path');

  SELECT health_status, health_score INTO v_status, v_score
  FROM project_health_states WHERE project_id = v_proj_mixed_p;
  PERFORM pg_temp.assert_eq(v_status, 'not_applicable', 'H: trigger must persist not_applicable');
  PERFORM pg_temp.assert_eq(v_score, NULL::INTEGER, 'H: trigger must persist NULL score');

  -- ====================================================================
  -- I. health events on not_applicable transitions
  -- ====================================================================
  -- A transition INTO not_applicable must emit exactly ONE event (status
  -- changed). A transition OUT of not_applicable must also emit exactly ONE.
  EXECUTE 'RESET ROLE';
  DELETE FROM project_health_events WHERE project_id = v_proj_mixed_a;
  DELETE FROM project_health_states WHERE project_id = v_proj_mixed_a;
  PERFORM public.recalculate_project_health_internal(v_proj_mixed_a); -- seed active state

  SELECT COUNT(*) INTO v_events_before FROM project_health_events WHERE project_id = v_proj_mixed_a;

  -- active -> completed (transition into not_applicable)
  UPDATE projects SET status = 'completed' WHERE id = v_proj_mixed_a;
  PERFORM pg_temp.assert_eq(
    (SELECT COUNT(*) FROM project_health_events WHERE project_id = v_proj_mixed_a),
    v_events_before + 1,
    'I: transition into not_applicable must emit exactly 1 event'
  );

  -- Verify the event row itself has correct columns (NULL new_score allowed
  -- for not_applicable, new_status = not_applicable). Order by id DESC for
  -- determinism (created_at can tie when both events fire in the same ms).
  SELECT new_status, new_score INTO v_status, v_score
  FROM project_health_events
  WHERE project_id = v_proj_mixed_a
    AND new_status = 'not_applicable'
  ORDER BY created_at DESC, id DESC LIMIT 1;
  PERFORM pg_temp.assert_eq(v_status, 'not_applicable', 'I: latest event new_status must be not_applicable');
  PERFORM pg_temp.assert_eq(v_score, NULL::INTEGER, 'I: latest event new_score must be NULL');

  -- ====================================================================
  -- J. notifications not spammed on not_applicable transitions
  -- ====================================================================
  EXECUTE 'RESET ROLE';
  DELETE FROM notifications WHERE type = 'project_health_changed' AND entity_id = v_proj_mixed_x;
  DELETE FROM project_health_events WHERE project_id = v_proj_mixed_x;
  DELETE FROM project_health_states WHERE project_id = v_proj_mixed_x;
  PERFORM public.recalculate_project_health_internal(v_proj_mixed_x); -- seed not_applicable state

  SELECT COUNT(*) INTO v_notifs_before FROM notifications WHERE type = 'project_health_changed' AND entity_id = v_proj_mixed_x;

  -- Trigger another recalc on the cancelled project (status stays
  -- not_applicable -> no status change -> no new event -> no notification).
  PERFORM public.recalculate_project_health_internal(v_proj_mixed_x);

  SELECT COUNT(*) INTO v_notifs_after FROM notifications WHERE type = 'project_health_changed' AND entity_id = v_proj_mixed_x;
  PERFORM pg_temp.assert_eq(v_notifs_after, v_notifs_before, 'J: no notification spam on not_applicable recalc');

  -- ====================================================================
  -- CLEANUP: remove test projects (cascades health states/events)
  -- ====================================================================
  EXECUTE 'RESET ROLE';
  DELETE FROM projects WHERE id IN (v_proj_active, v_proj_active2, v_proj_completed, v_proj_cancelled, v_proj_mixed_a, v_proj_mixed_p, v_proj_mixed_c, v_proj_mixed_x);

  RAISE NOTICE 'ALL PROJECT HEALTH LIFECYCLE TESTS PASSED';
END;
$$;
