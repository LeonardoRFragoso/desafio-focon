-- Complete seed data for demonstration (idempotent)
-- This migration creates demo users, projects, hourly rates, and time entries

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

-- Create demo profiles (assuming auth.users entries exist)
-- Ana: 550e8400-e29b-41d4-a716-446655550001
-- Bruno: 550e8400-e29b-41d4-a716-446655550002
-- Carla: 550e8400-e29b-41d4-a716-446655550003
INSERT INTO profiles (id, full_name, role, created_at, updated_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655550001', 'Ana Silva', 'member', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550002', 'Bruno Santos', 'member', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550003', 'Carla Oliveira', 'member', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

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

-- Create approved time entries for Residencial Aurora
-- Ana: 40 hours at R$ 120/h = R$ 4.800
-- Bruno: 30 hours at R$ 150/h = R$ 4.500
-- Total labor cost: R$ 9.300
INSERT INTO time_entries (id, project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, created_at, updated_at)
VALUES
  ('750e8400-e29b-41d4-a716-446655550001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550001', '2024-06-15', 2400, 'Estrutura e fundações', 'approved', 120.00, NOW(), NOW()),
  ('750e8400-e29b-41d4-a716-446655550002', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655550002', '2024-06-20', 1800, 'Alvenaria e revestimento', 'approved', 150.00, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create approved time entries for Edifício Horizonte
-- Ana: 20 hours at R$ 120/h = R$ 2.400
-- Carla: 25 hours at R$ 100/h = R$ 2.500
-- Total labor cost: R$ 4.900
INSERT INTO time_entries (id, project_id, professional_id, entry_date, duration_minutes, description, approval_status, applied_hourly_rate, created_at, updated_at)
VALUES
  ('750e8400-e29b-41d4-a716-446655550003', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655550001', '2024-07-10', 1200, 'Projeto estrutural', 'approved', 120.00, NOW(), NOW()),
  ('750e8400-e29b-41d4-a716-446655550004', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655550003', '2024-07-15', 1500, 'Acabamento e pintura', 'approved', 100.00, NOW(), NOW())
ON CONFLICT DO NOTHING;

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
