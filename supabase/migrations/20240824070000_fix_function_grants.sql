-- ============================================================================
-- Migration: 20240824070000
-- Fix over-broad EXECUTE grants on SECURITY DEFINER helper functions.
--
-- Three functions were granted to PUBLIC (executable by any role, including
-- any authenticated user), creating abuse / information-leak vectors:
--
--   1. create_notification(p_user_id, p_type, p_title, p_body, ...)
--      Any authenticated user could call this directly to insert arbitrary
--      notifications into ANY user's inbox (spam / phishing via the in-app
--      notification system). The function is SECURITY DEFINER so it bypasses
--      RLS on notifications.
--      Fix: REVOKE FROM PUBLIC. The function is only called from SECURITY
--      DEFINER trigger functions (notify_admins_on_entry_submission,
--      notify_on_approval_change, notify_on_comment_received) which run as
--      the postgres owner and can call it regardless of grants.
--
--   2. get_admin_user_ids()
--      Any authenticated user could enumerate all admin user UUIDs. While
--      UUIDs are not directly sensitive, the list of admins is.
--      Fix: REVOKE FROM PUBLIC. Only called from SECURITY DEFINER trigger
--      functions.
--
--   3. process_recurring_time_entries(p_run_date)
--      Any authenticated user could trigger recurring entry processing,
--      which creates time entries for other users. The previous migration
--      (20240824060000) revoked from anon and authenticated but NOT from
--      PUBLIC — and the original grant was to PUBLIC, so the revoke was
--      ineffective.
--      Fix: REVOKE FROM PUBLIC. Already granted to service_role (the only
--      legitimate caller via pg_cron / service invocations).
-- ============================================================================

-- 1. create_notification: internal helper for trigger functions only.
REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
-- No GRANT needed: SECURITY DEFINER triggers call it as the postgres owner.

-- 2. get_admin_user_ids: internal helper for trigger functions only.
REVOKE EXECUTE ON FUNCTION public.get_admin_user_ids() FROM PUBLIC;
-- No GRANT needed: SECURITY DEFINER triggers call it as the postgres owner.

-- 3. process_recurring_time_entries: service_role only (pg_cron / admin).
REVOKE EXECUTE ON FUNCTION public.process_recurring_time_entries(DATE) FROM PUBLIC;
-- GRANT to service_role already exists from migration 20240824060000.
-- Re-assert it for clarity and idempotency.
GRANT EXECUTE ON FUNCTION public.process_recurring_time_entries(DATE) TO service_role;
