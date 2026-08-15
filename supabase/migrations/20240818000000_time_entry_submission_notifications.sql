-- ============================================================================
-- FoconFlow Product Evolution 2.0 — Fase 2 Migration
-- Time entry submission notifications + comment notifications
--
-- Adds:
--   1. 'entry_submitted' notification type (admin gets notified on new pending)
--   2. 'comment_received' notification type (already in CHECK but no trigger)
--   3. Trigger: notify_admins_on_entry_submission (AFTER INSERT, status=pending)
--   4. Trigger: notify_on_comment_received (AFTER INSERT on time_entry_comments)
--
-- Design:
--   * Triggers use SECURITY DEFINER functions to bypass RLS for notification
--     creation (via create_notification helper).
--   * No frontend can spoof admin notifications — the DB determines recipients.
--   * No duplicate notifications (one per admin per entry).
--   * Comment notifications skip the comment author (no self-notification).
--   * Idempotent: uses DROP IF EXISTS before CREATE.
-- ============================================================================

-- ============================================================================
-- 1. Extend notifications CHECK constraint to include 'entry_submitted'
-- ============================================================================
DO $$
BEGIN
  -- Drop old constraint and add new one with entry_submitted
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'entry_approved', 'entry_rejected', 'entry_pending_reminder',
      'entry_submitted',
      'period_closing', 'budget_threshold', 'comment_received',
      'system'
    ));
END
$$;

-- ============================================================================
-- 2. Helper: get all admin user IDs
--    SECURITY DEFINER so trigger functions can enumerate admins without
--    being blocked by RLS on profiles.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_user_ids()
RETURNS UUID[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT array_agg(id) FROM public.profiles WHERE role = 'admin';
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_user_ids() FROM anon;

-- ============================================================================
-- 3. Trigger: notify admins when a new pending time entry is submitted
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_admins_on_entry_submission()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_ids UUID[];
  v_admin_id  UUID;
  v_prof_name TEXT;
  v_proj_name TEXT;
  v_duration  TEXT;
  v_body      TEXT;
BEGIN
  -- Only notify on new pending entries (not approved/rejected at creation)
  IF NEW.approval_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- Only fire on INSERT (not UPDATE)
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Get admin recipients
  v_admin_ids := public.get_admin_user_ids();
  IF v_admin_ids IS NULL OR array_length(v_admin_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Gather entry context for notification body
  SELECT full_name INTO v_prof_name FROM public.profiles WHERE id = NEW.professional_id;
  SELECT name INTO v_proj_name FROM public.projects WHERE id = NEW.project_id;
  v_duration := format('%s minutos', NEW.duration_minutes);
  v_body := format('%s registrou %s em %s.',
    COALESCE(v_prof_name, 'Profissional'),
    v_duration,
    COALESCE(v_proj_name, 'projeto'));

  -- Create one notification per admin (no duplicates)
  FOREACH v_admin_id IN ARRAY v_admin_ids LOOP
    PERFORM public.create_notification(
      v_admin_id,
      'entry_submitted',
      'Novo apontamento aguardando aprovação',
      v_body,
      'time_entry',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_entry_submission ON public.time_entries;
CREATE TRIGGER trg_notify_entry_submission
  AFTER INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_entry_submission();

-- ============================================================================
-- 4. Trigger: notify entry owner when a comment is received
--    (skips comment author to avoid self-notification)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_on_comment_received()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry_owner UUID;
  v_author_name TEXT;
  v_body        TEXT;
BEGIN
  -- Get the time entry owner
  SELECT professional_id INTO v_entry_owner
  FROM public.time_entries
  WHERE id = NEW.time_entry_id;

  -- Don't notify the comment author about their own comment
  IF v_entry_owner IS NULL OR v_entry_owner = NEW.author_id THEN
    RETURN NEW;
  END IF;

  -- Get author name for notification body
  SELECT full_name INTO v_author_name FROM public.profiles WHERE id = NEW.author_id;

  v_body := format('%s comentou no seu apontamento: "%s"',
    COALESCE(v_author_name, 'Alguém'),
    left(NEW.body, 80));

  PERFORM public.create_notification(
    v_entry_owner,
    'comment_received',
    'Novo comentário no seu apontamento',
    v_body,
    'time_entry',
    NEW.time_entry_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment_received ON public.time_entry_comments;
CREATE TRIGGER trg_notify_comment_received
  AFTER INSERT ON public.time_entry_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment_received();

-- ============================================================================
-- 5. Update time_entries RLS: allow members to set phase_id/task_id on INSERT
--    The existing INSERT policy only guards professional_id = auth.uid().
--    We need to ensure members can write phase_id and task_id columns.
--    The existing policy already allows INSERT with any columns, so no change
--    needed — but we add an UPDATE policy extension for pending entries to
--    allow phase_id/task_id modification.
-- ============================================================================
-- The existing member update policy allows updating pending own entries.
-- The recalc_rate_and_guard_update trigger already prevents professional_id
-- changes. phase_id and task_id are safe for members to set on their own
-- pending entries, so no additional policy is needed.

-- ============================================================================
-- 6. Index for faster admin notification queries by type
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON public.notifications (type, created_at DESC)
  WHERE type IN ('entry_submitted', 'comment_received');
