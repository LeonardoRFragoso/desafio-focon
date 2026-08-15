-- ============================================================================
-- Phase: Operational Consistency — Time Entry Temporal Rules
-- Migration: 20240823000000
--
-- Enforces:
--   A1/A3: No future dates (entry_date > CURRENT_DATE → DENIED) for ALL users
--   A6/A7: Retroactive justification required for entry_date <= CURRENT_DATE - 3
--          (applies to professionals AND admins, exempt for system/recurring)
--   A12:   Recurring function guarded against future date creation
--   A13:   Closed-period protection preserved (existing triggers unchanged)
--
-- Order of enforcement (conceptual):
--   1. future date? → DENIED
--   2. closed period? → DENIED (existing trigger, unchanged)
--   3. late >= 3 days without reason? → DENIED
-- ============================================================================

-- ============================================================================
-- 1. Add late_submission_reason column to time_entries
-- ============================================================================
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS late_submission_reason TEXT;

-- CHECK constraint: when present, reason must be 10-500 chars (after trim)
ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS valid_late_submission_reason;
ALTER TABLE public.time_entries
  ADD CONSTRAINT valid_late_submission_reason CHECK (
    late_submission_reason IS NULL OR (
      LENGTH(TRIM(late_submission_reason)) >= 10
      AND LENGTH(TRIM(late_submission_reason)) <= 500
    )
  );

-- Index for filtering retroactive entries in admin views
CREATE INDEX IF NOT EXISTS idx_time_entries_late_reason
  ON public.time_entries(late_submission_reason)
  WHERE late_submission_reason IS NOT NULL;

-- ============================================================================
-- 2. Trigger function: enforce temporal rules (future date + late justification)
--    Runs BEFORE INSERT and BEFORE UPDATE on time_entries.
--    Must execute BEFORE the closed-period trigger so future-date is caught first.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_temporal_rules_time_entries()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_days_late INTEGER;
  v_is_system BOOLEAN;
BEGIN
  -- Determine if this is a system-context insert (service_role / recurring).
  -- auth.uid() is NULL when the service_role or pg_cron invokes functions
  -- directly (no JWT). System context is exempt from late-justification
  -- (recurring entries are automated) but NOT from the future-date rule.
  v_is_system := (auth.uid() IS NULL);

  -- ----------------------------------------------------------------
  -- RULE 1: No future dates — applies to EVERYONE (including admin)
  -- ----------------------------------------------------------------
  IF NEW.entry_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'FOCONFLOW_FUTURE_DATE: Não é possível registrar horas em uma data futura (%)',
      NEW.entry_date::TEXT;
  END IF;

  -- ----------------------------------------------------------------
  -- RULE 2: Retroactive justification (>= 3 days late)
  --   Applies to human users (professionals AND admins).
  --   System/recurring context is exempt.
  -- ----------------------------------------------------------------
  IF NOT v_is_system THEN
    v_days_late := (CURRENT_DATE - NEW.entry_date);
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
END;
$$;

-- ============================================================================
-- 3. Create triggers (drop existing if any for idempotency)
--    These must run BEFORE the closed-period triggers.
--    PostgreSQL fires triggers in alphabetical order by name within the same
--    table/event/timing. We name them so they sort before the existing ones.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_enforce_temporal_insert ON public.time_entries;
DROP TRIGGER IF EXISTS trg_enforce_temporal_update ON public.time_entries;

-- "a_enforce_temporal" sorts before "enforce_closed_period" alphabetically
CREATE TRIGGER trg_a_enforce_temporal_insert
  BEFORE INSERT ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_temporal_rules_time_entries();

CREATE TRIGGER trg_a_enforce_temporal_update
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_temporal_rules_time_entries();

-- ============================================================================
-- 4. Guard process_recurring_time_entries against future date creation
--    and set late_submission_reason when the automated entry is 3+ days late.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_recurring_time_entries(
  p_run_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (rule_id UUID, entry_id UUID, status TEXT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_entry_id UUID;
  v_rate NUMERIC;
  v_period_closed BOOLEAN;
  v_days_late INTEGER;
  v_late_reason TEXT;
BEGIN
  -- Guard: never process for future dates
  IF p_run_date > CURRENT_DATE THEN
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
      v_days_late := CURRENT_DATE - v_rule.next_run_date;
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

-- ============================================================================
-- 5. Grant access to the new column (authenticated already has table-level
--    grants from earlier migrations, so the new column is automatically
--    accessible. No additional GRANT needed for column-level.)
-- ============================================================================

-- ============================================================================
-- 6. Update the time_entries RLS policies to allow users to set
--    late_submission_reason on their own entries (already covered by
--    existing INSERT/UPDATE policies — no changes needed).
-- ============================================================================
