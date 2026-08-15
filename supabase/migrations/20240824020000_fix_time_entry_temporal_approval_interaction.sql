-- ============================================================================
-- Hotfix: Time Entry Approval / Rejection vs Temporal Rules Regression
-- Migration: 20240824020000
--
-- Root Cause:
--   The temporal rules trigger (trg_a_enforce_temporal_update) fires on EVERY
--   BEFORE UPDATE of time_entries, re-validating future-date and late-justification
--   rules even for status-only changes (pending → approved / pending → rejected).
--   This blocks admins from approving/rejecting legacy entries that were created
--   before the temporal policy existed.
--
-- Fix Strategy:
--   1. Refactor enforce_temporal_rules_time_entries() to only validate on INSERT
--      or when entry_date actually changes on UPDATE.
--   2. Add explicit future-date denial in approve_time_entry() with a stable
--      domain error code (FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY).
--   3. Ensure reject_time_entry() does NOT block future legacy rejection.
--   4. Preserve all existing rules: no future creates, late justification on
--      new retroatives, closed period protection, recurring guards.
--
-- Legacy Data Policy:
--   - Retroactive legacy (created before policy, no late_reason): grandfathered.
--     Admin can approve/reject without re-validation.
--   - Future legacy (created before future-date block): cannot be APPROVED
--     (explicit denial in approve RPC), but CAN be REJECTED or corrected.
-- ============================================================================

-- ============================================================================
-- 1. Refactor temporal trigger: only validate on INSERT or entry_date change
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_temporal_rules_time_entries()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_days_late INTEGER;
  v_is_system BOOLEAN;
  v_effective_date DATE;
BEGIN
  -- Determine if this is a system-context insert (service_role / recurring).
  -- auth.uid() is NULL when the service_role or pg_cron invokes functions
  -- directly (no JWT). System context is exempt from late-justification
  -- (recurring entries are automated) but NOT from the future-date rule.
  v_is_system := (auth.uid() IS NULL);

  -- ----------------------------------------------------------------
  -- INSERT: full temporal validation (future date + late justification)
  -- ----------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    -- RULE 1: No future dates — applies to EVERYONE (including admin)
    IF NEW.entry_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'FOCONFLOW_FUTURE_DATE: Não é possível registrar horas em uma data futura (%)',
        NEW.entry_date::TEXT;
    END IF;

    -- RULE 2: Retroactive justification (>= 3 days late) — human users only
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
  END IF;

  -- ----------------------------------------------------------------
  -- UPDATE: only validate when entry_date actually changes.
  -- Status-only updates (pending → approved, pending → rejected) must NOT
  -- re-trigger temporal validation. This is the core regression fix.
  -- ----------------------------------------------------------------
  IF TG_OP = 'UPDATE' THEN
    -- Skip entirely if entry_date hasn't changed — this is a status-only
    -- or metadata-only update (approval, rejection, description edit, etc.)
    IF NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date THEN
      RETURN NEW;
    END IF;

    -- entry_date changed — validate the NEW date.
    -- RULE 1: No future dates on entry_date change
    IF NEW.entry_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'FOCONFLOW_FUTURE_DATE: Não é possível alterar a data para uma data futura (%)',
        NEW.entry_date::TEXT;
    END IF;

    -- RULE 2: Retroactive justification when moving to a date >= 3 days back.
    -- Only require justification if the NEW date is retroactive AND the
    -- entry didn't already have a valid reason. This allows correcting a
    -- future legacy entry to a valid past date.
    IF NOT v_is_system THEN
      v_days_late := (CURRENT_DATE - NEW.entry_date);
      IF v_days_late >= 3 THEN
        IF NEW.late_submission_reason IS NULL
           OR LENGTH(TRIM(NEW.late_submission_reason)) < 10
        THEN
          RAISE EXCEPTION 'FOCONFLOW_LATE_JUSTIFICATION: A nova data requer justificativa de retroativo (% dias). Informe o motivo do lançamento retroativo.',
            v_days_late;
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Update approve_time_entry: explicit future-date denial with domain code
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_time_entry(p_entry_id UUID)
RETURNS TABLE (id UUID, approval_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
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
  IF v_entry.entry_date > CURRENT_DATE THEN
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

-- ============================================================================
-- 3. Update reject_time_entry: allow future legacy rejection (no future check)
--    The temporal trigger won't block status-only updates anymore, but we
--    keep this RPC explicit: rejection is always allowed for pending entries
--    regardless of entry_date. Closed period check is preserved.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_time_entry(p_entry_id UUID, p_reason TEXT)
RETURNS TABLE (id UUID, approval_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_reason TEXT := TRIM(p_reason);
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can reject time entries';
  END IF;

  IF v_reason IS NULL OR LENGTH(v_reason) < 10 OR LENGTH(v_reason) > 1000 THEN
    RAISE EXCEPTION 'A rejection reason between 10 and 1000 characters is required';
  END IF;

  SELECT * INTO v_entry FROM public.time_entries te WHERE te.id = p_entry_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Time entry not found';
  END IF;

  IF v_entry.approval_status != 'pending' THEN
    RAISE EXCEPTION 'Only pending time entries can be rejected (current: %)', v_entry.approval_status;
  END IF;

  -- Closed period check (preserved from original).
  -- Future dates don't have closed periods in the past, so this is a no-op
  -- for future legacy entries.
  IF public.is_period_closed(v_entry.entry_date) THEN
    RAISE EXCEPTION 'Cannot reject a time entry in a closed accounting period (%)', to_char(v_entry.entry_date, 'YYYY-MM');
  END IF;

  -- Status-only update: temporal trigger skips validation (entry_date unchanged).
  -- Future legacy entries CAN be rejected — admin needs to clean up invalid data.
  UPDATE public.time_entries
    SET approval_status = 'rejected',
        rejection_reason = v_reason,
        rejected_by = auth.uid(),
        rejected_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE public.time_entries.id = p_entry_id;

  INSERT INTO public.time_entry_approval_history (time_entry_id, previous_status, new_status, reason, changed_by)
    VALUES (p_entry_id, 'pending', 'rejected', v_reason, auth.uid());

  PERFORM public.write_audit_log(
    'reject_time_entry', 'time_entry', p_entry_id,
    jsonb_build_object('approval_status', v_entry.approval_status),
    jsonb_build_object('approval_status', 'rejected', 'rejection_reason', v_reason),
    NULL
  );

  RETURN QUERY SELECT p_entry_id, 'rejected'::TEXT;
END;
$$;

-- ============================================================================
-- 4. Batch approve/reject: no changes needed — they delegate to the single
--    RPCs and already handle partial failures via EXCEPTION blocks.
--    The approve RPC will now return FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY
--    for future entries, which batch_approve will surface as a per-item error.
-- ============================================================================

-- ============================================================================
-- 5. Grant execute on updated functions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.approve_time_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_time_entry(UUID, TEXT) TO authenticated;
