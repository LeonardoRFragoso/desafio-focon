-- Allow service_role to manage profiles during provisioning
CREATE POLICY "Service role can manage profiles"
  ON profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to manage projects
CREATE POLICY "Service role can manage projects"
  ON projects FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to manage project_financials
CREATE POLICY "Service role can manage project_financials"
  ON project_financials FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to manage hourly_rates
CREATE POLICY "Service role can manage hourly_rates"
  ON hourly_rates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to manage time_entries
CREATE POLICY "Service role can manage time_entries"
  ON time_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
