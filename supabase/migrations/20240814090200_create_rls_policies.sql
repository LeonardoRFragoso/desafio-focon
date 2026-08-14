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
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Users cannot modify their own role"
  ON profiles FOR UPDATE
  WITH CHECK (
    auth.uid() = id AND
    OLD.role = NEW.role
  );

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (is_admin(auth.uid()));

-- Projects RLS Policies
CREATE POLICY "Members can view non-financial project info"
  ON projects FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage projects"
  ON projects FOR ALL
  USING (is_admin(auth.uid()));

-- Project Financials RLS Policies
CREATE POLICY "Only admins can view project financials"
  ON project_financials FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can manage project financials"
  ON project_financials FOR ALL
  USING (is_admin(auth.uid()));

-- Hourly Rates RLS Policies
CREATE POLICY "Only admins can view hourly rates"
  ON hourly_rates FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can manage hourly rates"
  ON hourly_rates FOR ALL
  USING (is_admin(auth.uid()));

-- Time Entries RLS Policies
CREATE POLICY "Users can view their own time entries"
  ON time_entries FOR SELECT
  USING (auth.uid() = professional_id);

CREATE POLICY "Admins can view all time entries"
  ON time_entries FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Users can create their own time entries"
  ON time_entries FOR INSERT
  WITH CHECK (auth.uid() = professional_id);

CREATE POLICY "Users can update their own pending time entries"
  ON time_entries FOR UPDATE
  USING (auth.uid() = professional_id AND approval_status = 'pending')
  WITH CHECK (auth.uid() = professional_id AND approval_status = 'pending');

CREATE POLICY "Users can delete their own pending time entries"
  ON time_entries FOR DELETE
  USING (auth.uid() = professional_id AND approval_status = 'pending');

CREATE POLICY "Admins can manage all time entries"
  ON time_entries FOR ALL
  USING (is_admin(auth.uid()));
