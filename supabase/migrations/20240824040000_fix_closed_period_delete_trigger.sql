-- ============================================================================
-- Hotfix: Restore authorized time entry deletes in open periods
-- Migration: 20240824040000
--
-- Root Cause:
--   enforce_closed_period_time_entries() is a BEFORE trigger used for INSERT,
--   UPDATE and DELETE on public.time_entries. PostgreSQL BEFORE-trigger
--   semantics require:
--     BEFORE INSERT  -> RETURN NEW   (NEW = the new row)
--     BEFORE UPDATE  -> RETURN NEW   (NEW = the new row)
--     BEFORE DELETE  -> RETURN OLD   (OLD = the row being deleted)
--   Returning NULL from a BEFORE trigger silently cancels the operation
--   WITHOUT raising an error.
--
--   The previous implementation always returned NEW. On a BEFORE DELETE,
--   NEW is NULL, so the function returned NULL even when the delete was
--   authorized (open period, own pending entry, or admin). The result was
--   that authorized DELETEs were silently cancelled: the statement did not
--   raise, but the row was not removed.
--
--   The admin bypass branch also returned NEW (NULL on DELETE), so admin
--   deletes of open-period entries were silently cancelled too.
--
-- Fix:
--   Branch on TG_OP explicitly. For DELETE, validate OLD.entry_date against
--   the closed-period rule and RETURN OLD (allowing the delete to proceed)
--   when authorized. For INSERT/UPDATE, keep the existing NEW-based behavior.
--   The admin bypass now returns the correct row variable per TG_OP.
--
-- Closed-period preservation:
--   - professional DELETE in a closed period  -> RAISE EXCEPTION (DENIED)
--   - professional INSERT/UPDATE in closed period -> RAISE EXCEPTION (DENIED)
--   - admin bypass unchanged in intent (admins manage periods/reopen as needed)
--
-- RLS preservation:
--   This trigger does not bypass RLS. The existing DELETE policy
--   ("Users can delete their own pending time entries" / "Admins can manage
--   all time entries") still fully applies. The trigger only enforces the
--   closed-period business rule; it never widens access.
--
-- No SECURITY DEFINER bypass is introduced. The function remains SECURITY
-- DEFINER only so it can call is_admin()/is_period_closed() (which themselves
-- read accounting_periods via SECURITY DEFINER); it does not grant any new
-- data access.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_closed_period_time_entries()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_date DATE;
BEGIN
  -- Admins manage periods/reopen as needed; they bypass the closed-period
  -- rule. Return the correct row variable per TG_OP so we never accidentally
  -- cancel an authorized admin DELETE by returning NULL.
  IF public.is_admin(auth.uid()) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Non-admins: enforce closed-period protection.
  -- On DELETE, NEW is NULL, so resolve the date from OLD.
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.entry_date;
  ELSE
    v_date := NEW.entry_date;
  END IF;

  IF public.is_period_closed(v_date) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete a time entry in a closed accounting period (%)', to_char(v_date, 'YYYY-MM');
    ELSE
      RAISE EXCEPTION 'Cannot create or edit a time entry in a closed accounting period (%)', to_char(v_date, 'YYYY-MM');
    END IF;
  END IF;

  -- Authorized operation: return the correct row variable so the operation
  -- proceeds. Returning NULL here would silently cancel it (the bug).
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- No trigger (re)creation needed: the existing triggers
--   trg_enforce_closed_period_insert
--   trg_enforce_closed_period_update
--   trg_enforce_closed_period_delete
-- already reference this function via EXECUTE FUNCTION, so replacing the
-- function body is sufficient. The triggers are not dropped/recreated to
-- avoid any transient un-protected window and to keep the migration minimal.
