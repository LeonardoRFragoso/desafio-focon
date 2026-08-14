-- Seed authentication users for local Supabase development
-- This file creates demo users in auth.users table
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
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change_token,
  phone_change,
  phone_change_sent_at,
  confirmed_at,
  email_change_token_current,
  banned_until
)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655550001'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'ana@example.com',
    '$2a$10$PQr8/Ym5VxWK1.vfVfVLKOYvB8/LewKgsRQP3CqJsf.XNzg/W2JCm',
    NOW(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ana Silva"}'::jsonb,
    false,
    NOW(),
    NOW(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    NOW(),
    NULL
  ),
  (
    '550e8400-e29b-41d4-a716-446655550002'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'bruno@example.com',
    '$2a$10$PQr8/Ym5VxWK1.vfVfVLKOYvB8/LewKgsRQP3CqJsf.XNzg/W2JCm',
    NOW(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Bruno Santos"}'::jsonb,
    false,
    NOW(),
    NOW(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    NOW(),
    NULL
  ),
  (
    '550e8400-e29b-41d4-a716-446655550003'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'carla@example.com',
    '$2a$10$PQr8/Ym5VxWK1.vfVfVLKOYvB8/LewKgsRQP3CqJsf.XNzg/W2JCm',
    NOW(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Carla Oliveira"}'::jsonb,
    false,
    NOW(),
    NOW(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    NOW(),
    NULL
  ),
  (
    '550e8400-e29b-41d4-a716-446655550099'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'admin@example.com',
    '$2a$10$PQr8/Ym5VxWK1.vfVfVLKOYvB8/LewKgsRQP3CqJsf.XNzg/W2JCm',
    NOW(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Admin User"}'::jsonb,
    false,
    NOW(),
    NOW(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    NOW(),
    NULL
  )
ON CONFLICT (id) DO NOTHING;

-- Update identities table to match
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655550001'::uuid,
    '550e8400-e29b-41d4-a716-446655550001'::uuid,
    '{"email":"ana@example.com"}'::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655550002'::uuid,
    '550e8400-e29b-41d4-a716-446655550002'::uuid,
    '{"email":"bruno@example.com"}'::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655550003'::uuid,
    '550e8400-e29b-41d4-a716-446655550003'::uuid,
    '{"email":"carla@example.com"}'::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655550099'::uuid,
    '550e8400-e29b-41d4-a716-446655550099'::uuid,
    '{"email":"admin@example.com"}'::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;
