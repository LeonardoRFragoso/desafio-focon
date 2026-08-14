-- Seed demo data (idempotent)
-- This migration creates demo users, projects, and time entries for testing

-- Create demo users if they don't exist
-- Note: In production, users should be created through auth.users
-- For local testing, we'll insert into profiles assuming auth.users entries exist

-- Create demo projects
INSERT INTO projects (id, name, client, status, start_date, end_date)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Residencial Aurora', 'Construção Aurora', 'active', '2024-01-01', '2024-12-31'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Edifício Horizonte', 'Construção Horizonte', 'active', '2024-02-01', '2024-11-30')
ON CONFLICT DO NOTHING;

-- Create project financials
INSERT INTO project_financials (project_id, contracted_revenue, tax_rate, indirect_cost)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 120000.00, 0.08, 5000.00),
  ('550e8400-e29b-41d4-a716-446655440002', 80000.00, 0.08, 5000.00)
ON CONFLICT (project_id) DO NOTHING;

-- Note: Demo profiles and hourly rates should be created through auth.users
-- and managed through the application's admin interface.
-- The seed data for time entries will be created after profiles are set up.
