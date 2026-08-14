-- Re-enable RLS with proper service_role policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE hourly_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Authenticated users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Service role has full access" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view non-financial project info" ON projects;
DROP POLICY IF EXISTS "Admins can manage projects" ON projects;
DROP POLICY IF EXISTS "Only admins can view project financials" ON project_financials;
DROP POLICY IF EXISTS "Only admins can manage project financials" ON project_financials;
DROP POLICY IF EXISTS "Only admins can view hourly rates" ON hourly_rates;
DROP POLICY IF EXISTS "Only admins can manage hourly rates" ON hourly_rates;
DROP POLICY IF EXISTS "Authenticated users can view their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Admins can view all time entries" ON time_entries;
DROP POLICY IF EXISTS "Authenticated users can create their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Authenticated users can update their own pending time entries" ON time_entries;
DROP POLICY IF EXISTS "Authenticated users can delete their own pending time entries" ON time_entries;
DROP POLICY IF EXISTS "Admins can manage all time entries" ON time_entries;

-- Profiles policies
CREATE POLICY "Service role full access"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins view all profiles"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins update profiles"
  ON profiles FOR UPDATE
  USING (is_admin(auth.uid()));

-- Projects policies
CREATE POLICY "Service role full access"
  ON projects FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users view projects"
  ON projects FOR SELECT
  USING (true);

CREATE POLICY "Admins manage projects"
  ON projects FOR ALL
  USING (is_admin(auth.uid()));

-- Project financials policies
CREATE POLICY "Service role full access"
  ON project_financials FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins view financials"
  ON project_financials FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins manage financials"
  ON project_financials FOR ALL
  USING (is_admin(auth.uid()));

-- Hourly rates policies
CREATE POLICY "Service role full access"
  ON hourly_rates FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins view rates"
  ON hourly_rates FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins manage rates"
  ON hourly_rates FOR ALL
  USING (is_admin(auth.uid()));

-- Time entries policies
CREATE POLICY "Service role full access"
  ON time_entries FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users view own entries"
  ON time_entries FOR SELECT
  USING (auth.uid() = professional_id);

CREATE POLICY "Admins view all entries"
  ON time_entries FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Users create own entries"
  ON time_entries FOR INSERT
  WITH CHECK (auth.uid() = professional_id);

CREATE POLICY "Users update own pending"
  ON time_entries FOR UPDATE
  USING (auth.uid() = professional_id AND approval_status = 'pending');

CREATE POLICY "Users delete own pending"
  ON time_entries FOR DELETE
  USING (auth.uid() = professional_id AND approval_status = 'pending');

CREATE POLICY "Admins manage all entries"
  ON time_entries FOR ALL
  USING (is_admin(auth.uid()));
