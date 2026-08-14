-- Drop existing policies that block service_role
DROP POLICY IF EXISTS "Authenticated users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Service role bypass profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can manage profiles" ON profiles;

-- Create new profiles policies that allow service_role
CREATE POLICY "Service role has full access"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view their own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Drop and recreate other table policies
DROP POLICY IF EXISTS "Authenticated users can view non-financial project info" ON projects;
DROP POLICY IF EXISTS "Admins can manage projects" ON projects;
DROP POLICY IF EXISTS "Service role bypass projects" ON projects;
DROP POLICY IF EXISTS "Service role can manage projects" ON projects;

CREATE POLICY "Service role has full access"
  ON projects FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view non-financial project info"
  ON projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage projects"
  ON projects FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Drop and recreate project_financials policies
DROP POLICY IF EXISTS "Only admins can view project financials" ON project_financials;
DROP POLICY IF EXISTS "Only admins can manage project financials" ON project_financials;
DROP POLICY IF EXISTS "Service role bypass project_financials" ON project_financials;
DROP POLICY IF EXISTS "Service role can manage project_financials" ON project_financials;

CREATE POLICY "Service role has full access"
  ON project_financials FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only admins can view project financials"
  ON project_financials FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can manage project financials"
  ON project_financials FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Drop and recreate hourly_rates policies
DROP POLICY IF EXISTS "Only admins can view hourly rates" ON hourly_rates;
DROP POLICY IF EXISTS "Only admins can manage hourly rates" ON hourly_rates;
DROP POLICY IF EXISTS "Service role bypass hourly_rates" ON hourly_rates;
DROP POLICY IF EXISTS "Service role can manage hourly_rates" ON hourly_rates;

CREATE POLICY "Service role has full access"
  ON hourly_rates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only admins can view hourly rates"
  ON hourly_rates FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can manage hourly rates"
  ON hourly_rates FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Drop and recreate time_entries policies
DROP POLICY IF EXISTS "Authenticated users can view their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Admins can view all time entries" ON time_entries;
DROP POLICY IF EXISTS "Authenticated users can create their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Authenticated users can update their own pending time entries" ON time_entries;
DROP POLICY IF EXISTS "Authenticated users can delete their own pending time entries" ON time_entries;
DROP POLICY IF EXISTS "Admins can manage all time entries" ON time_entries;
DROP POLICY IF EXISTS "Service role bypass time_entries" ON time_entries;
DROP POLICY IF EXISTS "Service role can manage time_entries" ON time_entries;

CREATE POLICY "Service role has full access"
  ON time_entries FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view their own time entries"
  ON time_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = professional_id);

CREATE POLICY "Admins can view all time entries"
  ON time_entries FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can create their own time entries"
  ON time_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = professional_id);

CREATE POLICY "Authenticated users can update their own pending time entries"
  ON time_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = professional_id AND approval_status = 'pending')
  WITH CHECK (auth.uid() = professional_id AND approval_status = 'pending');

CREATE POLICY "Authenticated users can delete their own pending time entries"
  ON time_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = professional_id AND approval_status = 'pending');

CREATE POLICY "Admins can manage all time entries"
  ON time_entries FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));
