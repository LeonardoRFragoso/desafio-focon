-- Demonstration data seed
-- This file is used to populate demo users, profiles, hourly rates, and time entries
-- It should be executed AFTER migrations via `supabase db reset`
-- 
-- Demo user UUIDs (created by auth trigger on user signup):
-- Ana: 550e8400-e29b-41d4-a716-446655550001
-- Bruno: 550e8400-e29b-41d4-a716-446655550002
-- Carla: 550e8400-e29b-41d4-a716-446655550003
-- Admin: 550e8400-e29b-41d4-a716-446655550099

-- Create demo auth users via auth.users (Supabase managed)
-- These will trigger the profile creation via the auth trigger
-- Note: In local Supabase, use the Studio UI or API to create users
-- For automated seed, we insert directly into auth.users (local only)

-- Create demo profiles directly (assumes auth.users entries exist with these IDs)
-- The trigger will NOT fire on direct inserts, so we create profiles manually
-- Use ON CONFLICT DO UPDATE to ensure correct roles
INSERT INTO profiles (id, full_name, role, created_at, updated_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655550001', 'Ana Silva', 'member', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550002', 'Bruno Santos', 'member', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550003', 'Carla Oliveira', 'member', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550099', 'Admin User', 'admin', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  updated_at = NOW();

-- Create hourly rates for professionals
-- Ana: R$ 120/h (valid from 2024-01-01)
-- Bruno: R$ 150/h (valid from 2024-01-01)
-- Carla: R$ 100/h (valid from 2024-01-01)
INSERT INTO hourly_rates (id, professional_id, hourly_rate, valid_from, valid_until, created_at, updated_at)
VALUES
  ('650e8400-e29b-41d4-a716-446655550001', '550e8400-e29b-41d4-a716-446655550001', 120.00, '2024-01-01', NULL, NOW(), NOW()),
  ('650e8400-e29b-41d4-a716-446655550002', '550e8400-e29b-41d4-a716-446655550002', 150.00, '2024-01-01', NULL, NOW(), NOW()),
  ('650e8400-e29b-41d4-a716-446655550003', '550e8400-e29b-41d4-a716-446655550003', 100.00, '2024-01-01', NULL, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Project Workspace seed: phases, tasks, members
-- ============================================================================

-- Project members (assign team to demo projects)
INSERT INTO project_members (project_id, professional_id, project_role, created_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550099', 'manager', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', 'professional', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550002', 'technical_lead', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655550099', 'manager', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655550003', 'professional', '550e8400-e29b-41d4-a716-446655550099')
ON CONFLICT (project_id, professional_id) DO NOTHING;

-- Project phases for Residencial Aurora
INSERT INTO project_phases (id, project_id, name, description, status, position, planned_minutes, start_date, due_date, created_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655441001', '550e8400-e29b-41d4-a716-446655440001', 'Projeto Executivo', 'Desenvolvimento do projeto executivo', 'completed', 0, 4800, '2024-01-01', '2024-02-29', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655441002', '550e8400-e29b-41d4-a716-446655440001', 'Fundações', 'Execução das fundações', 'active', 1, 7200, '2024-03-01', '2024-05-31', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655441003', '550e8400-e29b-41d4-a716-446655440001', 'Estrutura', 'Execução da estrutura', 'planned', 2, 14400, '2024-06-01', '2024-09-30', '550e8400-e29b-41d4-a716-446655550099')
ON CONFLICT DO NOTHING;

-- Project phases for Edifício Horizonte
INSERT INTO project_phases (id, project_id, name, description, status, position, planned_minutes, start_date, due_date, created_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655441101', '550e8400-e29b-41d4-a716-446655440002', 'Levantamento', 'Levantamento de campo', 'completed', 0, 2400, '2024-02-01', '2024-02-29', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655441102', '550e8400-e29b-41d4-a716-446655440002', 'Execução', 'Execução dos serviços', 'active', 1, 9600, '2024-03-01', '2024-09-30', '550e8400-e29b-41d4-a716-446655550099')
ON CONFLICT DO NOTHING;

-- Project tasks for Residencial Aurora (phase: Fundações)
INSERT INTO project_tasks (id, project_id, phase_id, title, description, status, priority, assignee_id, planned_minutes, due_date, created_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655442001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655441002', 'Locação de obra', 'Locação das estacas e pilares', 'done', 'high', '550e8400-e29b-41d4-a716-446655550001', 1200, '2024-03-15', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655442002', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655441002', 'Escavação', 'Escavação para fundações rasas', 'in_progress', 'critical', '550e8400-e29b-41d4-a716-446655550002', 2400, '2024-04-30', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655442003', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655441002', 'Concretagem', 'Concretagem das fundações', 'todo', 'high', '550e8400-e29b-41d4-a716-446655550001', 1800, '2024-05-31', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655442004', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655441003', 'Impermeabilização', 'Impermeabilização das fundações', 'todo', 'medium', NULL, 600, '2024-06-15', '550e8400-e29b-41d4-a716-446655550099')
ON CONFLICT DO NOTHING;

-- Project tasks for Edifício Horizonte (phase: Execução)
INSERT INTO project_tasks (id, project_id, phase_id, title, description, status, priority, assignee_id, planned_minutes, due_date, created_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655442101', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655441102', 'Alvenaria', 'Execução de alvenaria', 'in_progress', 'high', '550e8400-e29b-41d4-a716-446655550003', 3600, '2024-06-30', '550e8400-e29b-41d4-a716-446655550099'),
  ('550e8400-e29b-41d4-a716-446655442102', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655441102', 'Revestimento', 'Revestimento de paredes', 'todo', 'medium', '550e8400-e29b-41d4-a716-446655550003', 3000, '2024-08-31', '550e8400-e29b-41d4-a716-446655550099')
ON CONFLICT DO NOTHING;

-- Time entries will be created manually via the application UI
-- The constraint on duration_minutes requires values > 0 and <= 480 (8 hours)

-- Expected financial results:
-- Residencial Aurora:
--   Receita: R$ 120.000
--   Mão de obra: R$ 9.300
--   Imposto (8%): R$ 9.600
--   Custo indireto: R$ 5.000
--   Resultado: R$ 96.100
--   Margem: 80,08%
--
-- Edifício Horizonte:
--   Receita: R$ 80.000
--   Mão de obra: R$ 4.900
--   Imposto (8%): R$ 6.400
--   Custo indireto: R$ 5.000
--   Resultado: R$ 63.700
--   Margem: 79,63%
--
-- Agregado:
--   Receita: R$ 200.000
--   Mão de obra: R$ 14.200
--   Imposto: R$ 16.000
--   Custo indireto: R$ 10.000
--   Resultado: R$ 159.800
--   Margem: 79,90%
