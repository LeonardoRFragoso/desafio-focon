-- Seed authentication users for local Supabase development
-- This file creates demo users in auth.users and auth.identities
-- Execute this BEFORE seed.sql to ensure profiles can be created
-- 
-- Usage (local Supabase):
--   psql -h localhost -p 54322 -U postgres -d postgres -f supabase/seed-auth.sql
--
-- For production, use Supabase Auth API or Studio UI instead

-- Demo credentials (for development only - never use in production)
-- Ana: ana@example.com / password123
-- Bruno: bruno@example.com / password123
-- Carla: carla@example.com / password123
-- Admin: admin@example.com / password123

-- Insert demo users into auth.users
-- Note: Passwords are hashed using bcrypt (cost 10)
-- All demo passwords are "password123"

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655550001'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'ana@example.com',
    '$2b$10$1p1VsLPP67.9/MS0m3rC1OdXz9szjNnL3rOWkzUn6.Q/Iq87k4/my',
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ana Silva"}'::jsonb,
    false,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  (
    '550e8400-e29b-41d4-a716-446655550002'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'bruno@example.com',
    '$2b$10$1p1VsLPP67.9/MS0m3rC1OdXz9szjNnL3rOWkzUn6.Q/Iq87k4/my',
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Bruno Santos"}'::jsonb,
    false,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  (
    '550e8400-e29b-41d4-a716-446655550003'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'carla@example.com',
    '$2b$10$1p1VsLPP67.9/MS0m3rC1OdXz9szjNnL3rOWkzUn6.Q/Iq87k4/my',
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Carla Oliveira"}'::jsonb,
    false,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  (
    '550e8400-e29b-41d4-a716-446655550099'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'admin@example.com',
    '$2b$10$1p1VsLPP67.9/MS0m3rC1OdXz9szjNnL3rOWkzUn6.Q/Iq87k4/my',
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Admin User"}'::jsonb,
    false,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
ON CONFLICT (id) DO NOTHING;
