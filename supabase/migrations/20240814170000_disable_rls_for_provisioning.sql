-- Temporarily disable RLS for all tables to allow service_role provisioning
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_financials DISABLE ROW LEVEL SECURITY;
ALTER TABLE hourly_rates DISABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries DISABLE ROW LEVEL SECURITY;
