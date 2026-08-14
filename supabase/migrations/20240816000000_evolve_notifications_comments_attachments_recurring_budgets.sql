-- ============================================================================
-- FoconFlow Product Evolution — Migration 2
-- Notifications, comments, attachments, recurring rules, project budgets,
-- profitability alerts, and user preferences.
--
-- Design principles:
--   * Every table has RLS enabled with least-privilege policies.
--   * Append-only tables (notifications, comments, attachments) use
--     INSERT-only policies for non-admins.
--   * All FKs are explicit and indexed.
--   * Timestamps default to now() at the DB level.
--   * No security-definer functions except where strictly needed (and they
--     always set search_path = public).
-- ============================================================================

-- ============================================================================
-- 1. Notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
    'entry_approved', 'entry_rejected', 'entry_pending_reminder',
    'period_closing', 'budget_threshold', 'comment_received',
    'system'
  )),
  title       TEXT NOT NULL,
  body        TEXT,
  entity_type TEXT,
  entity_id   UUID,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
-- Users can create notifications for themselves (e.g. reminders).
CREATE POLICY "notifications_insert_own" ON public.notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
-- Users can only mark their own notifications as read (update read_at only).
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

-- Service role can insert notifications for any user (system-generated).
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;
CREATE POLICY "notifications_insert_service" ON public.notifications
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 2. Comments (on time entries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.time_entry_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id UUID NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (length(trim(body)) >= 1 AND length(body) <= 2000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_entry ON public.time_entry_comments (time_entry_id, created_at);

ALTER TABLE public.time_entry_comments ENABLE ROW LEVEL SECURITY;

-- A user can see comments on entries they own OR if they are an admin.
DROP POLICY IF EXISTS "comments_select_own_or_admin" ON public.time_entry_comments;
CREATE POLICY "comments_select_own_or_admin" ON public.time_entry_comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.time_entries te WHERE te.id = time_entry_id AND te.professional_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

-- A user can comment on their own entries; admins can comment on any entry.
DROP POLICY IF EXISTS "comments_insert_own_or_admin" ON public.time_entry_comments;
CREATE POLICY "comments_insert_own_or_admin" ON public.time_entry_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.time_entries te WHERE te.id = time_entry_id AND te.professional_id = auth.uid())
      OR public.is_admin(auth.uid())
    )
  );

-- Authors can edit/delete their own comments; admins can delete any.
DROP POLICY IF EXISTS "comments_update_own" ON public.time_entry_comments;
CREATE POLICY "comments_update_own" ON public.time_entry_comments
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "comments_delete_own_or_admin" ON public.time_entry_comments;
CREATE POLICY "comments_delete_own_or_admin" ON public.time_entry_comments
  FOR DELETE USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============================================================================
-- 3. Attachments (metadata only; actual files in Supabase Storage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.time_entry_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id UUID NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  uploaded_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL CHECK (length(trim(file_name)) >= 1 AND length(file_name) <= 255),
  file_size     BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 10485760), -- 10 MB max
  content_type  TEXT NOT NULL CHECK (length(content_type) <= 100),
  storage_path  TEXT NOT NULL UNIQUE, -- path in the Supabase Storage bucket
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entry ON public.time_entry_attachments (time_entry_id);

ALTER TABLE public.time_entry_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attachments_select_own_or_admin" ON public.time_entry_attachments;
CREATE POLICY "attachments_select_own_or_admin" ON public.time_entry_attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.time_entries te WHERE te.id = time_entry_id AND te.professional_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "attachments_insert_own_or_admin" ON public.time_entry_attachments;
CREATE POLICY "attachments_insert_own_or_admin" ON public.time_entry_attachments
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.time_entries te WHERE te.id = time_entry_id AND te.professional_id = auth.uid())
      OR public.is_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "attachments_delete_own_or_admin" ON public.time_entry_attachments;
CREATE POLICY "attachments_delete_own_or_admin" ON public.time_entry_attachments
  FOR DELETE USING (uploaded_by = auth.uid() OR public.is_admin(auth.uid()));

-- ============================================================================
-- 4. Recurring time entry rules
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recurring_time_entry_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description     TEXT NOT NULL CHECK (length(trim(description)) >= 1 AND length(description) <= 500),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  frequency       TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week     SMALLINT CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  day_of_month    SMALLINT CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
  start_date      DATE NOT NULL,
  end_date        DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_date   DATE,
  next_run_date   DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_professional ON public.recurring_time_entry_rules (professional_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active_next ON public.recurring_time_entry_rules (next_run_date)
  WHERE is_active = TRUE;

ALTER TABLE public.recurring_time_entry_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_select_own" ON public.recurring_time_entry_rules;
CREATE POLICY "recurring_select_own" ON public.recurring_time_entry_rules
  FOR SELECT USING (professional_id = auth.uid());

DROP POLICY IF EXISTS "recurring_insert_own" ON public.recurring_time_entry_rules;
CREATE POLICY "recurring_insert_own" ON public.recurring_time_entry_rules
  FOR INSERT WITH CHECK (professional_id = auth.uid());

DROP POLICY IF EXISTS "recurring_update_own" ON public.recurring_time_entry_rules;
CREATE POLICY "recurring_update_own" ON public.recurring_time_entry_rules
  FOR UPDATE USING (professional_id = auth.uid()) WITH CHECK (professional_id = auth.uid());

DROP POLICY IF EXISTS "recurring_delete_own" ON public.recurring_time_entry_rules;
CREATE POLICY "recurring_delete_own" ON public.recurring_time_entry_rules
  FOR DELETE USING (professional_id = auth.uid());

-- ============================================================================
-- 5. Project budgets (optional, per-project)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_type TEXT NOT NULL CHECK (budget_type IN ('labor_hours', 'labor_cost', 'total_cost')),
  budget_value NUMERIC(14,2) NOT NULL CHECK (budget_value > 0),
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year >= 2000 AND fiscal_year <= 2100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, budget_type, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_budgets_project ON public.project_budgets (project_id);

ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;

-- Admins can manage budgets; all authenticated users can read.
DROP POLICY IF EXISTS "budgets_select_authenticated" ON public.project_budgets;
CREATE POLICY "budgets_select_authenticated" ON public.project_budgets
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budgets_admin_all" ON public.project_budgets;
CREATE POLICY "budgets_admin_all" ON public.project_budgets
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- 6. Profitability alerts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profitability_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  threshold   NUMERIC(5,2) NOT NULL CHECK (threshold >= 0 AND threshold <= 100),
  metric      TEXT NOT NULL CHECK (metric IN ('margin_percent', 'budget_utilization_percent')),
  triggered_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.profiles(id),
  acknowledged_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_project ON public.profitability_alerts (project_id);

ALTER TABLE public.profitability_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_select_admin" ON public.profitability_alerts;
CREATE POLICY "alerts_select_admin" ON public.profitability_alerts
  FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "alerts_admin_all" ON public.profitability_alerts;
CREATE POLICY "alerts_admin_all" ON public.profitability_alerts
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- 7. User preferences (key-value per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pref_key    TEXT NOT NULL CHECK (length(trim(pref_key)) >= 1 AND length(pref_key) <= 100),
  pref_value  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pref_key)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prefs_select_own" ON public.user_preferences;
CREATE POLICY "prefs_select_own" ON public.user_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "prefs_upsert_own" ON public.user_preferences;
CREATE POLICY "prefs_upsert_own" ON public.user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "prefs_update_own" ON public.user_preferences;
CREATE POLICY "prefs_update_own" ON public.user_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "prefs_delete_own" ON public.user_preferences;
CREATE POLICY "prefs_delete_own" ON public.user_preferences
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- 8. Trigger: update updated_at on new tables
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_comments ON public.time_entry_comments;
CREATE TRIGGER trg_touch_comments
  BEFORE UPDATE ON public.time_entry_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_recurring ON public.recurring_time_entry_rules;
CREATE TRIGGER trg_touch_recurring
  BEFORE UPDATE ON public.recurring_time_entry_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_budgets ON public.project_budgets;
CREATE TRIGGER trg_touch_budgets
  BEFORE UPDATE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_alerts ON public.profitability_alerts;
CREATE TRIGGER trg_touch_alerts
  BEFORE UPDATE ON public.profitability_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_prefs ON public.user_preferences;
CREATE TRIGGER trg_touch_prefs
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 9. RPC: create notification (service-role safe, used by triggers/RPCs)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
  VALUES (p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================================
-- 10. Trigger: notify on approval/rejection
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_on_approval_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  IF NEW.approval_status = OLD.approval_status THEN
    RETURN NEW;
  END IF;

  v_reason := COALESCE(NEW.rejection_reason, '');

  IF NEW.approval_status = 'approved' THEN
    PERFORM public.create_notification(
      NEW.professional_id,
      'entry_approved',
      'Apontamento aprovado',
      format('Seu apontamento de %s foi aprovado.', to_char(NEW.entry_date, 'DD/MM/YYYY')),
      'time_entry',
      NEW.id
    );
  ELSIF NEW.approval_status = 'rejected' THEN
    PERFORM public.create_notification(
      NEW.professional_id,
      'entry_rejected',
      'Apontamento rejeitado',
      format('Seu apontamento de %s foi rejeitado. Motivo: %s',
        to_char(NEW.entry_date, 'DD/MM/YYYY'), v_reason),
      'time_entry',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_approval ON public.time_entries;
CREATE TRIGGER trg_notify_approval
  AFTER UPDATE OF approval_status ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval_change();

-- ============================================================================
-- 11. RPC: process recurring rules (creates pending entries for due rules)
--     Called by a scheduled job (Supabase pg_cron or external scheduler).
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
BEGIN
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

      INSERT INTO public.time_entries (
        project_id, professional_id, entry_date,
        duration_minutes, description,
        approval_status, applied_hourly_rate
      ) VALUES (
        v_rule.project_id, v_rule.professional_id, v_rule.next_run_date,
        v_rule.duration_minutes, v_rule.description,
        'pending', v_rate
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

-- Revoke execute from anon/authenticated; only service_role and admin can run.
REVOKE EXECUTE ON FUNCTION public.process_recurring_time_entries(DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_recurring_time_entries(DATE) TO service_role;

-- ============================================================================
-- 12. Storage bucket for attachments (idempotent)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'time-entry-attachments',
  'time-entry-attachments',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'application/pdf', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can manage files in their own folder.
DROP POLICY IF EXISTS "attachments_storage_select_own" ON storage.objects;
CREATE POLICY "attachments_storage_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'time-entry-attachments'
    AND (auth.uid()::text = (storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "attachments_storage_insert_own" ON storage.objects;
CREATE POLICY "attachments_storage_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'time-entry-attachments'
    AND (auth.uid()::text = (storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "attachments_storage_delete_own" ON storage.objects;
CREATE POLICY "attachments_storage_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'time-entry-attachments'
    AND (auth.uid()::text = (storage.foldername(name))[1])
  );

-- ============================================================================
-- 13. Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.notifications,
  public.time_entry_comments,
  public.time_entry_attachments,
  public.recurring_time_entry_rules,
  public.user_preferences
  TO authenticated;

GRANT SELECT ON
  public.project_budgets,
  public.profitability_alerts
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.project_budgets,
  public.profitability_alerts
  TO authenticated;
