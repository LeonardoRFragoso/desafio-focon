-- ============================================================================
-- Canonical business timezone helper + temporal rule alignment
-- Migration: 20240824060000
--
-- Root Cause:
--   The database uses CURRENT_DATE in several business rules (future-date
--   rejection, retroactive justification threshold, recurring processing).
--   CURRENT_DATE resolves in the session's timezone, which on Supabase is
--   UTC by default. For Brazil (UTC-3), after 21:00 BRT the UTC date rolls
--   over to the next day, so:
--     - A professional logging an entry at 21:30 BRT on Aug 15 would be
--       told "future date" if they pick Aug 15 (because CURRENT_DATE is
--       already Aug 16 UTC).
--     - The retroactive threshold (>= 3 days late) would also shift by one
--       day in the wrong direction.
--   The frontend had the same bug (now fixed in src/lib/businessDate.ts).
--   This migration aligns the database side so both agree on "today" =
--   the America/Sao_Paulo calendar date.
--
-- Fix:
--   1. Add a canonical helper function public.business_current_date()
--      returning (now() AT TIME ZONE 'America/Sao_Paulo')::date.
--   2. Replace CURRENT_DATE with business_current_date() in the temporal
--      business rules that define "today" for domain decisions:
--        - enforce_temporal_rules_time_entries() (future-date + late reason)
--        - process_recurring_time_entries() (future-date guard + late reason)
--   3. NOT replaced: CURRENT_DATE usages in non-domain contexts (e.g.
--      capacity weekly bucketing, forecast elapsed-days, health overdue
--      computations) — those are intentionally left for a separate,
--      narrower review to avoid indiscriminate churn. The temporal
--      entry rules are the user-facing path where the UTC/BRT mismatch
--      directly rejects valid entries or accepts invalid ones.
--
-- The helper is STABLE and SECURITY INVOKER (no elevated access needed;
-- it only reads now() and casts). It is granted to authenticated so RPCs
-- and triggers running as the caller can use it. SECURITY DEFINER
-- functions that call it (the trigger functions) already run with
-- search_path = public, so resolution is unambiguous.
--
-- No RLS, no trigger, no SECURITY DEFINER bypass is introduced. The
-- migration is incremental and idempotent.
-- ============================================================================

-- ============================================================================
-- 1. Canonical business date helper
-- ============================================================================
CREATE OR REPLACE FUNCTION public.business_current_date()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

REVOKE EXECUTE ON FUNCTION public.business_current_date() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_current_date() TO authenticated, service_role;

-- ============================================================================
-- 2. enforce_temporal_rules_time_entries() — use business_current_date()
--    for the future-date rule and the retroactive justification threshold.
--    These are the two domain decisions where "today" must mean the
--    America/Sao_Paulo calendar date, not the UTC date.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_temporal_rules_time_entries()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today DATE := public.business_current_date();
  v_days_late INTEGER;
  v_is_system BOOLEAN;
BEGIN
  -- Determine if this is a system-context insert (service_role / recurring).
  -- auth.uid() is NULL when the service_role or pg_cron invokes functions
  -- directly (no JWT). System context is exempt from late-justification
  -- (recurring entries are automated) but NOT from the future-date rule.
  v_is_system := (auth.uid() IS NULL);

  -- ----------------------------------------------------------------
  -- INSERT: full temporal validation (future date + late justification)
  --   "today" is the America/Sao_Paulo calendar date (business_current_date).
  -- ----------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    -- RULE 1: No future dates — applies to EVERYONE (including admin)
    IF NEW.entry_date > v_today THEN
      RAISE EXCEPTION 'FOCONFLOW_FUTURE_DATE: Não é possível registrar horas em uma data futura (%)',
        NEW.entry_date::TEXT;
    END IF;

    -- RULE 2: Retroactive justification (>= 3 days late) — human users only
    IF NOT v_is_system THEN
      v_days_late := (v_today - NEW.entry_date);
      IF v_days_late >= 3 THEN
        IF NEW.late_submission_reason IS NULL
           OR LENGTH(TRIM(NEW.late_submission_reason)) < 10
        THEN
          RAISE EXCEPTION 'FOCONFLOW_LATE_JUSTIFICATION: Este apontamento está sendo registrado com % dias de atraso. Informe o motivo do lançamento retroativo.',
            v_days_late;
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------
  -- UPDATE: only validate when entry_date actually changes.
  -- Status-only updates (pending → approved, pending → rejected) must NOT
  -- re-trigger temporal validation. This preserves the fix from migration
  -- 20240824020000 (legacy entries grandfathered for approval/rejection).
  -- ----------------------------------------------------------------
  IF TG_OP = 'UPDATE' THEN
    -- Skip entirely if entry_date hasn't changed — this is a status-only
    -- or metadata-only update (approval, rejection, description edit, etc.)
    IF NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date THEN
      RETURN NEW;
    END IF;

    -- entry_date changed — validate the NEW date.
    -- RULE 1: No future dates on entry_date change
    IF NEW.entry_date > v_today THEN
      RAISE EXCEPTION 'FOCONFLOW_FUTURE_DATE: Não é possível alterar a data para uma data futura (%)',
        NEW.entry_date::TEXT;
    END IF;

    -- RULE 2: Retroactive justification on entry_date change — human users only
    IF NOT v_is_system THEN
      v_days_late := (v_today - NEW.entry_date);
      IF v_days_late >= 3 THEN
        IF NEW.late_submission_reason IS NULL
           OR LENGTH(TRIM(NEW.late_submission_reason)) < 10
        THEN
          RAISE EXCEPTION 'FOCONFLOW_LATE_JUSTIFICATION: Este apontamento está sendo registrado com % dias de atraso. Informe o motivo do lançamento retroativo.',
            v_days_late;
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Triggers already exist (trg_a_enforce_temporal_insert / _update) and
-- reference this function via EXECUTE FUNCTION, so replacing the body is
-- sufficient. We do NOT drop/recreate triggers to avoid any transient
-- un-protected window.

-- ============================================================================
-- 2b. approve_time_entry() — use business_current_date() for the future-date
--     denial so the RPC agrees with the trigger on what "today" means.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_time_entry(p_entry_id UUID)
RETURNS TABLE (id UUID, approval_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_today DATE := public.business_current_date();
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can approve time entries';
  END IF;

  SELECT * INTO v_entry FROM public.time_entries te WHERE te.id = p_entry_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Time entry not found';
  END IF;

  IF v_entry.approval_status != 'pending' THEN
    RAISE EXCEPTION 'Only pending time entries can be approved (current: %)', v_entry.approval_status;
  END IF;

  -- Explicit future-date denial: even legacy future entries cannot be approved.
  -- The admin must correct the date or reject the entry instead.
  -- "today" is the America/Sao_Paulo calendar date (business_current_date).
  IF v_entry.entry_date > v_today THEN
    RAISE EXCEPTION 'FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY: Não é possível aprovar um apontamento com data futura (%). Corrija a data ou rejeite o apontamento.',
      v_entry.entry_date::TEXT
      USING ERRCODE = 'P0001';
  END IF;

  -- Closed period check (preserved from original)
  IF public.is_period_closed(v_entry.entry_date) THEN
    RAISE EXCEPTION 'Cannot approve a time entry in a closed accounting period (%)', to_char(v_entry.entry_date, 'YYYY-MM');
  END IF;

  -- Status-only update: the temporal trigger will skip validation because
  -- entry_date is not changing.
  UPDATE public.time_entries
    SET approval_status = 'approved',
        rejection_reason = NULL,
        rejected_by = NULL,
        rejected_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE public.time_entries.id = p_entry_id;

  INSERT INTO public.time_entry_approval_history (time_entry_id, previous_status, new_status, reason, changed_by)
    VALUES (p_entry_id, 'pending', 'approved', NULL, auth.uid());

  PERFORM public.write_audit_log(
    'approve_time_entry', 'time_entry', p_entry_id,
    jsonb_build_object('approval_status', v_entry.approval_status),
    jsonb_build_object('approval_status', 'approved'),
    NULL
  );

  RETURN QUERY SELECT p_entry_id, 'approved'::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_time_entry(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_time_entry(UUID) TO authenticated;

-- ============================================================================
-- 3. process_recurring_time_entries() — use business_current_date() for
--    the future-date guard and the late-automated-entry reason.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_recurring_time_entries(
  p_run_date DATE DEFAULT public.business_current_date()
)
RETURNS TABLE (rule_id UUID, entry_id UUID, status TEXT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today DATE := public.business_current_date();
  v_rule RECORD;
  v_entry_id UUID;
  v_rate NUMERIC;
  v_period_closed BOOLEAN;
  v_days_late INTEGER;
  v_late_reason TEXT;
BEGIN
  -- Guard: never process for future dates (business-calendar "today")
  IF p_run_date > v_today THEN
    RAISE EXCEPTION 'FOCONFLOW_RECURRING_FUTURE: Cannot process recurring entries for future dates (%)',
      p_run_date::TEXT;
  END IF;

  FOR v_rule IN
    SELECT * FROM public.recurring_time_entry_rules
    WHERE is_active = TRUE
      AND next_run_date <= p_run_date
      AND (end_date IS NULL OR next_run_date <= end_date)
  LOOP
    BEGIN
      -- Check closed period
      SELECT public.is_period_closed(v_rule.next_run_date) INTO v_period_closed;
      IF v_period_closed THEN
        RETURN QUERY SELECT v_rule.id, NULL::UUID, 'skipped'::TEXT, 'period closed'::TEXT;
        -- Advance next_run_date even if skipped
        UPDATE public.recurring_time_entry_rules
          SET last_run_date = v_rule.next_run_date,
              next_run_date = CASE
                WHEN v_rule.frequency = 'daily' THEN v_rule.next_run_date + 1
                WHEN v_rule.frequency = 'weekly' THEN v_rule.next_run_date + 7
                WHEN v_rule.frequency = 'monthly' THEN (v_rule.next_run_date + INTERVAL '1 month')::DATE
              END
          WHERE id = v_rule.id;
        CONTINUE;
      END IF;

      -- Get hourly rate for the run date
      BEGIN
        SELECT public.get_hourly_rate_for_date(v_rule.professional_id, v_rule.next_run_date) INTO v_rate;
      EXCEPTION WHEN OTHERS THEN
        v_rate := 0;
      END;

      -- Determine if this is a late automated entry (3+ days behind)
      v_days_late := v_today - v_rule.next_run_date;
      IF v_days_late >= 3 THEN
        v_late_reason := 'Lançamento recorrente processado automaticamente com atraso de '
          || v_days_late || ' dia(s) pelo agendador automático.';
      ELSE
        v_late_reason := NULL;
      END IF;

      INSERT INTO public.time_entries (
        project_id, professional_id, entry_date,
        duration_minutes, description,
        approval_status, applied_hourly_rate,
        late_submission_reason
      ) VALUES (
        v_rule.project_id, v_rule.professional_id, v_rule.next_run_date,
        v_rule.duration_minutes, v_rule.description,
        'pending', v_rate,
        v_late_reason
      )
      RETURNING id INTO v_entry_id;

      -- Advance next_run_date
      UPDATE public.recurring_time_entry_rules
        SET last_run_date = v_rule.next_run_date,
            next_run_date = CASE
              WHEN v_rule.frequency = 'daily' THEN v_rule.next_run_date + 1
              WHEN v_rule.frequency = 'weekly' THEN v_rule.next_run_date + 7
              WHEN v_rule.frequency = 'monthly' THEN (v_rule.next_run_date + INTERVAL '1 month')::DATE
            END
        WHERE id = v_rule.id;

      RETURN QUERY SELECT v_rule.id, v_entry_id, 'created'::TEXT, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_rule.id, NULL::UUID, 'failed'::TEXT, SQLERRM::TEXT;
    END;
  END LOOP;
END;
$$;

-- Re-apply grants (function was recreated)
REVOKE EXECUTE ON FUNCTION public.process_recurring_time_entries(DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_recurring_time_entries(DATE) TO service_role;
