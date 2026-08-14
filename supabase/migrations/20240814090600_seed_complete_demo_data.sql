-- Seed data for domain entities (projects and financial data)
-- This migration creates only structural data that does not depend on auth.users

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

-- Note: Demo user profiles and time entries are created via supabase/seed.sql
-- This keeps migrations focused on structure and domain data only.
