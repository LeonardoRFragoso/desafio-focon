-- Fix provisioning access for service_role
-- Grant SELECT, INSERT, UPDATE, DELETE to service_role on project_budgets and profitability_alerts
-- These tables are protected by RLS policies that require auth.uid() context,
-- so service_role access is safe and necessary for demo provisioning.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_budgets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profitability_alerts TO service_role;

-- Ensure service_role can also manage sequences for these tables
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
