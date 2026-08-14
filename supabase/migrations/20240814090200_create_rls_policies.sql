-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Profiles RLS Policies
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

-- Projects RLS Policies
CREATE POLICY "Authenticated users can view non-financial project info"
  ON projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage projects"
  ON projects FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Project Financials RLS Policies
CREATE POLICY "Only admins can view project financials"
  ON project_financials FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can manage project financials"
  ON project_financials FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Hourly Rates RLS Policies
CREATE POLICY "Only admins can view hourly rates"
  ON hourly_rates FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can manage hourly rates"
  ON hourly_rates FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Time Entries RLS Policies
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
