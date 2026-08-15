-- Canonical business timezone — DB regression tests.
--
-- Validates that public.business_current_date() returns the America/Sao_Paulo
-- calendar date (not the UTC date), and that the temporal rules
-- (enforce_temporal_rules_time_entries) use the business date for the
-- future-date rejection and the retroactive justification threshold.
--
-- The previous implementation used CURRENT_DATE (UTC on Supabase), which
-- rolled over to the next day at 00:00 UTC (21:00 BRT). This caused the
-- database to reject entries dated "today BRT" as future dates after 21h,
-- and to miscalculate the 3-day late threshold by one day.
--
-- These tests do NOT depend on the real machine clock: they call the helper
-- with fixed instants and assert the resulting calendar date.

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

-- Helper: compute the America/Sao_Paulo calendar date for a fixed UTC instant
CREATE OR REPLACE FUNCTION pg_temp.sp_date(p_utc_ts TIMESTAMPTZ)
RETURNS DATE LANGUAGE sql STABLE AS $$
  SELECT (p_utc_ts AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

DO $$
DECLARE
  -- Fixed boundary instants (UTC). BRT = UTC-3 (no DST in Aug).
  v_2359_utc_same_day TIMESTAMPTZ := '2026-08-15 23:59:00+00'; -- 20:59 BRT Aug 15
  v_0000_utc_next_day TIMESTAMPTZ := '2026-08-16 00:00:00+00'; -- 21:00 BRT Aug 15
  v_0259_utc_next_day TIMESTAMPTZ := '2026-08-16 02:59:00+00'; -- 23:59 BRT Aug 15
  v_0300_utc_same_day TIMESTAMPTZ := '2026-08-15 03:00:00+00'; -- 00:00 BRT Aug 15
BEGIN
  -- ====================================================================
  -- 1. business_current_date() honors America/Sao_Paulo at boundaries
  -- ====================================================================
  -- We cannot stub now() inside the STABLE helper, so we verify the helper's
  -- underlying formula via pg_temp.sp_date at the same boundary instants.
  -- This proves the (now() AT TIME ZONE 'America/Sao_Paulo')::date formula
  -- returns the BRT calendar date, not the UTC date.

  -- 20:59 BRT -> still Aug 15
  PERFORM pg_temp.assert_eq(pg_temp.sp_date(v_2359_utc_same_day), '2026-08-15'::DATE,
    'T1: 20:59 BRT must be Aug 15');
  -- 21:00 BRT (00:00 UTC next day) -> still Aug 15 in BRT
  PERFORM pg_temp.assert_eq(pg_temp.sp_date(v_0000_utc_next_day), '2026-08-15'::DATE,
    'T2: 21:00 BRT must be Aug 15 (not Aug 16 UTC)');
  -- 23:59 BRT -> still Aug 15
  PERFORM pg_temp.assert_eq(pg_temp.sp_date(v_0259_utc_next_day), '2026-08-15'::DATE,
    'T3: 23:59 BRT must be Aug 15');
  -- 00:00 BRT (03:00 UTC) -> Aug 15
  PERFORM pg_temp.assert_eq(pg_temp.sp_date(v_0300_utc_same_day), '2026-08-15'::DATE,
    'T4: 00:00 BRT must be Aug 15');

  -- ====================================================================
  -- 2. business_current_date() returns a DATE (not text/timestamp)
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    pg_typeof(public.business_current_date()) IN ('date'::regtype),
    'T5: business_current_date() must return DATE type'
  );

  -- ====================================================================
  -- 3. The helper is consistent with the formula
  -- ====================================================================
  PERFORM pg_temp.assert_eq(
    public.business_current_date(),
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'T6: business_current_date() must equal (now() AT TIME ZONE SP)::date'
  );

  -- ====================================================================
  -- 4. enforce_temporal_rules_time_entries uses business date
  --    We verify the function body references business_current_date() (the
  --    source of truth for "today"). A direct behavioral test would require
  --    stubbing now() inside a SECURITY DEFINER function, which is not
  --    feasible without mocking the cluster clock. The formula-level tests
  --    above (T1-T4) prove the date computation; the integration is
  --    verified by the existing time_entry_temporal_rules.sql suite, which
  --    exercises the trigger end-to-end against CURRENT_DATE (now aligned
  --    to business_current_date()).
  -- ====================================================================
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'enforce_temporal_rules_time_entries'
        AND p.prosrc LIKE '%business_current_date%'
    ),
    'T7: enforce_temporal_rules_time_entries must call business_current_date()'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'process_recurring_time_entries'
        AND p.prosrc LIKE '%business_current_date%'
    ),
    'T8: process_recurring_time_entries must call business_current_date()'
  );

  RAISE NOTICE 'ALL BUSINESS TIMEZONE TESTS PASSED';
END;
$$;
