-- FoconFlow product evolution: time entries approval, rejection reasons,
-- approval history, audit logs, accounting periods (monthly close).
-- Incremental migration: does not alter existing applied migrations' content;
-- only adds columns/tables/functions/triggers and replaces triggers safely.

-- ============================================================================
-- 1. time_entries: rejection reason metadata
-- ============================================================================
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

-- Rejection reason: required when status is rejected, forbidden otherwise.
ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS valid_rejection_reason;
ALTER TABLE public.time_entries
  ADD CONSTRAINT valid_rejection_reason CHECK (
    (approval_status = 'rejected' AND rejection_reason IS NOT NULL
       AND LENGTH(TRIM(rejection_reason)) >= 10
       AND LENGTH(TRIM(rejection_reason)) <= 1000)
    OR (approval_status != 'rejected' AND rejection_reason IS NULL
        AND rejected_by IS NULL AND rejected_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_time_entries_rejected_at ON public.time_entries(rejected_at);

-- ============================================================================
-- 2. time_entry_approval_history (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.time_entry_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id UUID NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL CHECK (previous_status IN ('pending','approved','rejected')),
  new_status TEXT NOT NULL CHECK (new_status IN ('pending','approved','rejected')),
  reason TEXT,
  changed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teah_time_entry ON public.time_entry_approval_history(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_teah_changed_by ON public.time_entry_approval_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_teah_created_at ON public.time_entry_approval_history(created_at);

ALTER TABLE public.time_entry_approval_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.time_entry_approval_history FROM anon;
GRANT SELECT, INSERT ON TABLE public.time_entry_approval_history TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.time_entry_approval_history TO service_role;

-- Professionals can view history of their own entries; admins can view all.
CREATE POLICY "Users can view their own approval history"
  ON public.time_entry_approval_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.id = time_entry_approval_history.time_entry_id
        AND te.professional_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all approval history"
  ON public.time_entry_approval_history FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- No direct INSERT/UPDATE/DELETE for authenticated users (append-only, written only by
-- SECURITY DEFINER functions / service_role). service_role bypasses RLS.

-- ============================================================================
-- 3. audit_logs (append-only administrative log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.audit_logs FROM anon;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.audit_logs TO service_role;

-- Only admins can read audit logs; nobody (authenticated) can write directly.
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- 4. accounting_periods (monthly close)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key TEXT NOT NULL UNIQUE, -- e.g. '2026-08'
  status TEXT NOT NULL CHECK (status IN ('open','closed')) DEFAULT 'open',
  closed_at TIMESTAMP WITH TIME ZONE,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT valid_period_key CHECK (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT closed_consistency CHECK (
    (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
    OR (status = 'open' AND closed_at IS NULL AND closed_by IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_status ON public.accounting_periods(status);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_key ON public.accounting_periods(period_key);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.accounting_periods FROM anon;
GRANT SELECT ON TABLE public.accounting_periods TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.accounting_periods TO service_role;

CREATE POLICY "Authenticated users can view accounting periods"
  ON public.accounting_periods FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage periods (close/reopen). Direct writes blocked for non-admins.
CREATE POLICY "Admins can manage accounting periods"
  ON public.accounting_periods FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- 5. Helper: is period closed for a given date?
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_period_closed(p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE status = 'closed'
      AND period_key = to_char(p_date, 'YYYY-MM')
  );
$$;

-- ============================================================================
-- 6. Replace hourly-rate trigger: recalc on pending update, immutable otherwise.
--    Also block professional_id changes on UPDATE.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_prevent_hourly_rate_modification ON public.time_entries;
DROP FUNCTION IF EXISTS public.prevent_hourly_rate_modification();

CREATE OR REPLACE FUNCTION public.recalc_rate_and_guard_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  -- professional_id must never change via update.
  IF NEW.professional_id IS DISTINCT FROM OLD.professional_id THEN
    RAISE EXCEPTION 'professional_id cannot be changed';
  END IF;

  IF NEW.approval_status = 'pending' THEN
    -- For pending entries, the system always (re)computes the rate from entry_date,
    -- ignoring any client-supplied value.
    SELECT public.get_hourly_rate_for_date(NEW.professional_id, NEW.entry_date) INTO v_rate;
    NEW.applied_hourly_rate := v_rate;
  ELSE
    -- Approved/rejected entries: applied_hourly_rate is immutable.
    IF NEW.applied_hourly_rate IS DISTINCT FROM OLD.applied_hourly_rate THEN
      RAISE EXCEPTION 'Cannot modify applied_hourly_rate of a non-pending time entry';
    END IF;
    -- Rejection metadata must stay consistent (guarded by CHECK too).
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalc_rate_and_guard_update
BEFORE UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.recalc_rate_and_guard_update();

-- ============================================================================
-- 7. Closed-period protection for professional-side time_entries mutations.
--    Admins bypass (they manage via RPCs / direct admin actions); the RPCs still
--    enforce closed-period rules where appropriate.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_closed_period_time_entries()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_date DATE;
BEGIN
  v_date := COALESCE(NEW.entry_date, OLD.entry_date);

  -- Only restrict non-admins. Admins manage periods/reopen as needed.
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF public.is_period_closed(v_date) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete a time entry in a closed accounting period (%)', to_char(v_date, 'YYYY-MM');
    ELSE
      RAISE EXCEPTION 'Cannot create or edit a time entry in a closed accounting period (%)', to_char(v_date, 'YYYY-MM');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_closed_period_insert ON public.time_entries;
DROP TRIGGER IF EXISTS trg_enforce_closed_period_update ON public.time_entries;
DROP TRIGGER IF EXISTS trg_enforce_closed_period_delete ON public.time_entries;

CREATE TRIGGER trg_enforce_closed_period_insert
BEFORE INSERT ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_closed_period_time_entries();

CREATE TRIGGER trg_enforce_closed_period_update
BEFORE UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_closed_period_time_entries();

CREATE TRIGGER trg_enforce_closed_period_delete
BEFORE DELETE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_closed_period_time_entries();

-- ============================================================================
-- 8. Internal helper: write audit log (callable from SECURITY DEFINER funcs).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_before_data, p_after_data, p_metadata);
END;
$$;

-- ============================================================================
-- 9. RPC: approve a single time entry (admin only).
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

  IF public.is_period_closed(v_entry.entry_date) THEN
    RAISE EXCEPTION 'Cannot approve a time entry in a closed accounting period (%)', to_char(v_entry.entry_date, 'YYYY-MM');
  END IF;

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
-- 10. RPC: reject a single time entry (admin only, reason required).
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

  IF public.is_period_closed(v_entry.entry_date) THEN
    RAISE EXCEPTION 'Cannot reject a time entry in a closed accounting period (%)', to_char(v_entry.entry_date, 'YYYY-MM');
  END IF;

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
-- 11. RPC: batch approve (transactional, partial feedback via returned set).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.batch_approve_time_entries(p_entry_ids UUID[])
RETURNS TABLE (entry_id UUID, status TEXT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can approve time entries';
  END IF;

  FOREACH v_id IN ARRAY p_entry_ids LOOP
    BEGIN
      PERFORM public.approve_time_entry(v_id);
      RETURN QUERY SELECT v_id, 'approved'::TEXT, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_id, 'failed'::TEXT, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- 12. RPC: batch reject (transactional per item, reason required).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.batch_reject_time_entries(p_entry_ids UUID[], p_reason TEXT)
RETURNS TABLE (entry_id UUID, status TEXT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can reject time entries';
  END IF;

  FOREACH v_id IN ARRAY p_entry_ids LOOP
    BEGIN
      PERFORM public.reject_time_entry(v_id, p_reason);
      RETURN QUERY SELECT v_id, 'rejected'::TEXT, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_id, 'failed'::TEXT, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- 13. RPC: close / reopen accounting period (admin only, audited).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.close_accounting_period(p_period_key TEXT)
RETURNS TABLE (period_key TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can close accounting periods';
  END IF;

  SELECT * INTO v_period FROM public.accounting_periods ap WHERE ap.period_key = p_period_key FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounting period % not found', p_period_key;
  END IF;

  IF v_period.status = 'closed' THEN
    RAISE EXCEPTION 'Accounting period % is already closed', p_period_key;
  END IF;

  UPDATE public.accounting_periods
    SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = auth.uid(), updated_at = CURRENT_TIMESTAMP
    WHERE public.accounting_periods.period_key = p_period_key;

  PERFORM public.write_audit_log(
    'close_accounting_period', 'accounting_period', v_period.id,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'closed'),
    jsonb_build_object('period_key', p_period_key)
  );

  RETURN QUERY SELECT p_period_key, 'closed'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period(p_period_key TEXT)
RETURNS TABLE (period_key TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can reopen accounting periods';
  END IF;

  SELECT * INTO v_period FROM public.accounting_periods ap WHERE ap.period_key = p_period_key FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounting period % not found', p_period_key;
  END IF;

  IF v_period.status = 'open' THEN
    RAISE EXCEPTION 'Accounting period % is already open', p_period_key;
  END IF;

  UPDATE public.accounting_periods
    SET status = 'open', closed_at = NULL, closed_by = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE public.accounting_periods.period_key = p_period_key;

  PERFORM public.write_audit_log(
    'reopen_accounting_period', 'accounting_period', v_period.id,
    jsonb_build_object('status', 'closed'),
    jsonb_build_object('status', 'open'),
    jsonb_build_object('period_key', p_period_key)
  );

  RETURN QUERY SELECT p_period_key, 'open'::TEXT;
END;
$$;

-- ============================================================================
-- 14. Grants for new RPCs to authenticated role.
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.approve_time_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_time_entry(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_approve_time_entries(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_reject_time_entries(UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_accounting_period(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_accounting_period(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_period_closed(DATE) TO authenticated;
GRANT SELECT ON TABLE public.time_entry_approval_history TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT ON TABLE public.accounting_periods TO authenticated;
