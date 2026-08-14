-- Final deterministic security state after remote demo provisioning.

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles',
        'projects',
        'project_financials',
        'hourly_rates',
        'time_entries'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.projects,
  public.project_financials,
  public.hourly_rates,
  public.time_entries
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.projects,
  public.project_financials,
  public.hourly_rates,
  public.time_entries
TO authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.profiles,
  public.projects,
  public.project_financials,
  public.hourly_rates,
  public.time_entries
TO service_role;

CREATE POLICY "Authenticated users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage projects"
  ON public.projects FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can view project financials"
  ON public.project_financials FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can manage project financials"
  ON public.project_financials FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can view hourly rates"
  ON public.hourly_rates FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can manage hourly rates"
  ON public.hourly_rates FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own time entries"
  ON public.time_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = professional_id);

CREATE POLICY "Admins can view all time entries"
  ON public.time_entries FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can create their own time entries"
  ON public.time_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = professional_id);

CREATE POLICY "Users can update their own pending time entries"
  ON public.time_entries FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = professional_id
    AND approval_status = 'pending'
  )
  WITH CHECK (
    auth.uid() = professional_id
    AND approval_status = 'pending'
  );

CREATE POLICY "Users can delete their own pending time entries"
  ON public.time_entries FOR DELETE
  TO authenticated
  USING (
    auth.uid() = professional_id
    AND approval_status = 'pending'
  );

CREATE POLICY "Admins can manage all time entries"
  ON public.time_entries FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
