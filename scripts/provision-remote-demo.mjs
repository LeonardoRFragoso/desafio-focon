#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import process from 'process';

const isDryRun = process.argv.includes('--dry-run');

// Validate environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_USER_PASSWORD',
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please set them in .env.provision.local');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoPassword = process.env.DEMO_USER_PASSWORD;

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made');
  console.log(`📍 Supabase URL: ${supabaseUrl}`);
  console.log('✓ Service role key is set');
  console.log('✓ Demo password is set');
  console.log('\n📋 Planned operations:');
  console.log('  1. Create/locate users: ana, bruno, carla, admin');
  console.log('  2. Create projects: Residencial Aurora, Edifício Horizonte');
  console.log('  3. Create project financials');
  console.log('  4. Create hourly rates');
  console.log('  5. Create time entries (pending)');
  console.log('  6. Approve time entries');
  console.log('\n✅ Dry run validation passed');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const USERS = [
  { email: 'ana@example.com', fullName: 'Ana', role: 'member' },
  { email: 'bruno@example.com', fullName: 'Bruno', role: 'member' },
  { email: 'carla@example.com', fullName: 'Carla', role: 'member' },
  { email: 'admin@example.com', fullName: 'Administrador', role: 'admin' },
];

const PROJECTS = [
  {
    name: 'Residencial Aurora',
    client: 'Cliente Aurora',
    status: 'active',
    startDate: '2024-08-01',
    endDate: '2024-12-31',
    revenue: 120000,
    taxRate: 0.08,
    indirectCost: 5000,
  },
  {
    name: 'Edifício Horizonte',
    client: 'Cliente Horizonte',
    status: 'active',
    startDate: '2024-08-15',
    endDate: '2024-11-30',
    revenue: 80000,
    taxRate: 0.08,
    indirectCost: 5000,
  },
];

const HOURLY_RATES = [
  { email: 'ana@example.com', rate: 120, validFrom: '2024-08-01', validUntil: null },
  { email: 'bruno@example.com', rate: 150, validFrom: '2024-08-01', validUntil: null },
  { email: 'carla@example.com', rate: 100, validFrom: '2024-08-01', validUntil: null },
];

const TIME_ENTRIES = [
  // Residencial Aurora
  { email: 'ana@example.com', project: 'Residencial Aurora', date: '2024-08-05', hours: 8, description: 'Análise de estrutura' },
  { email: 'ana@example.com', project: 'Residencial Aurora', date: '2024-08-06', hours: 8, description: 'Projeto arquitetônico' },
  { email: 'ana@example.com', project: 'Residencial Aurora', date: '2024-08-07', hours: 8, description: 'Revisão de plantas' },
  { email: 'ana@example.com', project: 'Residencial Aurora', date: '2024-08-08', hours: 8, description: 'Coordenação com cliente' },
  { email: 'ana@example.com', project: 'Residencial Aurora', date: '2024-08-09', hours: 8, description: 'Ajustes finais' },
  { email: 'bruno@example.com', project: 'Residencial Aurora', date: '2024-08-05', hours: 6, description: 'Cálculos estruturais' },
  { email: 'bruno@example.com', project: 'Residencial Aurora', date: '2024-08-06', hours: 6, description: 'Detalhamento de armadura' },
  { email: 'bruno@example.com', project: 'Residencial Aurora', date: '2024-08-07', hours: 6, description: 'Verificação de cargas' },
  { email: 'bruno@example.com', project: 'Residencial Aurora', date: '2024-08-08', hours: 6, description: 'Relatório técnico' },
  { email: 'bruno@example.com', project: 'Residencial Aurora', date: '2024-08-09', hours: 6, description: 'Aprovação final' },
  // Edifício Horizonte
  { email: 'ana@example.com', project: 'Edifício Horizonte', date: '2024-08-20', hours: 4, description: 'Levantamento de requisitos' },
  { email: 'ana@example.com', project: 'Edifício Horizonte', date: '2024-08-21', hours: 4, description: 'Esboço preliminar' },
  { email: 'ana@example.com', project: 'Edifício Horizonte', date: '2024-08-22', hours: 4, description: 'Apresentação ao cliente' },
  { email: 'ana@example.com', project: 'Edifício Horizonte', date: '2024-08-23', hours: 4, description: 'Ajustes solicitados' },
  { email: 'ana@example.com', project: 'Edifício Horizonte', date: '2024-08-24', hours: 4, description: 'Documentação final' },
  { email: 'carla@example.com', project: 'Edifício Horizonte', date: '2024-08-20', hours: 5, description: 'Análise de viabilidade' },
  { email: 'carla@example.com', project: 'Edifício Horizonte', date: '2024-08-21', hours: 5, description: 'Estudo de impacto' },
  { email: 'carla@example.com', project: 'Edifício Horizonte', date: '2024-08-22', hours: 5, description: 'Parecer técnico' },
  { email: 'carla@example.com', project: 'Edifício Horizonte', date: '2024-08-23', hours: 5, description: 'Revisão de documentos' },
  { email: 'carla@example.com', project: 'Edifício Horizonte', date: '2024-08-24', hours: 5, description: 'Aprovação de conformidade' },
];

async function provision() {
  try {
    console.log('🚀 Starting demo provisioning...\n');

    // Step 1: Create/locate users
    console.log('📝 Processing users...');
    const userMap = new Map();

    for (const user of USERS) {
      try {
        // Try to get existing user
        const { data: existingUser } = await supabase.auth.admin.getUserById(
          // We'll use email lookup instead
        );

        // Create user if doesn't exist
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: demoPassword,
          email_confirm: true,
          user_metadata: { full_name: user.fullName },
        });

        if (authError && !authError.message.includes('already exists')) {
          throw authError;
        }

        if (authUser) {
          userMap.set(user.email, authUser.user.id);
          console.log(`  ✓ User created: ${user.email}`);
        } else {
          // User already exists, fetch by email
          const { data: users } = await supabase.auth.admin.listUsers();
          const existingUser = users.users.find(u => u.email === user.email);
          if (existingUser) {
            userMap.set(user.email, existingUser.id);
            console.log(`  ✓ User exists: ${user.email}`);
          }
        }
      } catch (error) {
        console.error(`  ❌ Error with user ${user.email}:`, error.message);
        throw error;
      }
    }

    // Step 2: Update profiles with correct roles
    console.log('\n📋 Updating profiles...');
    for (const user of USERS) {
      const userId = userMap.get(user.email);
      if (userId) {
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: user.fullName, role: user.role })
          .eq('id', userId);

        if (error) throw error;
        console.log(`  ✓ Profile updated: ${user.email} (${user.role})`);
      }
    }

    // Step 3: Create projects
    console.log('\n🏗️  Creating projects...');
    const projectMap = new Map();

    for (const project of PROJECTS) {
      const { data: existingProject } = await supabase
        .from('projects')
        .select('id')
        .eq('name', project.name)
        .single();

      let projectId;
      if (existingProject) {
        projectId = existingProject.id;
        console.log(`  ✓ Project exists: ${project.name}`);
      } else {
        const { data: newProject, error } = await supabase
          .from('projects')
          .insert([
            {
              name: project.name,
              client: project.client,
              status: project.status,
              start_date: project.startDate,
              end_date: project.endDate,
            },
          ])
          .select('id')
          .single();

        if (error) throw error;
        projectId = newProject.id;
        console.log(`  ✓ Project created: ${project.name}`);
      }

      projectMap.set(project.name, { id: projectId, ...project });
    }

    // Step 4: Create project financials
    console.log('\n💰 Creating project financials...');
    for (const [projectName, projectData] of projectMap) {
      const { data: existingFinancial } = await supabase
        .from('project_financials')
        .select('project_id')
        .eq('project_id', projectData.id)
        .single();

      if (!existingFinancial) {
        const { error } = await supabase
          .from('project_financials')
          .insert([
            {
              project_id: projectData.id,
              contracted_revenue: projectData.revenue,
              tax_rate: projectData.taxRate,
              indirect_cost: projectData.indirectCost,
            },
          ]);

        if (error) throw error;
        console.log(`  ✓ Financial data created: ${projectName}`);
      } else {
        console.log(`  ✓ Financial data exists: ${projectName}`);
      }
    }

    // Step 5: Create hourly rates
    console.log('\n💵 Creating hourly rates...');
    for (const rate of HOURLY_RATES) {
      const userId = userMap.get(rate.email);
      if (userId) {
        const { data: existingRate } = await supabase
          .from('hourly_rates')
          .select('id')
          .eq('professional_id', userId)
          .eq('valid_from', rate.validFrom)
          .single();

        if (!existingRate) {
          const { error } = await supabase
            .from('hourly_rates')
            .insert([
              {
                professional_id: userId,
                hourly_rate: rate.rate,
                valid_from: rate.validFrom,
                valid_until: rate.validUntil,
              },
            ]);

          if (error) throw error;
          console.log(`  ✓ Hourly rate created: ${rate.email} (R$ ${rate.rate}/h)`);
        } else {
          console.log(`  ✓ Hourly rate exists: ${rate.email}`);
        }
      }
    }

    // Step 6: Create time entries
    console.log('\n⏱️  Creating time entries...');
    for (const entry of TIME_ENTRIES) {
      const userId = userMap.get(entry.email);
      const projectId = projectMap.get(entry.project)?.id;

      if (userId && projectId) {
        const { data: existingEntry } = await supabase
          .from('time_entries')
          .select('id')
          .eq('professional_id', userId)
          .eq('project_id', projectId)
          .eq('entry_date', entry.date)
          .eq('description', entry.description)
          .single();

        if (!existingEntry) {
          const { data: newEntry, error } = await supabase
            .from('time_entries')
            .insert([
              {
                professional_id: userId,
                project_id: projectId,
                entry_date: entry.date,
                duration_minutes: entry.hours * 60,
                description: entry.description,
                approval_status: 'pending',
                applied_hourly_rate: 0, // Will be set by trigger
              },
            ])
            .select('id, applied_hourly_rate')
            .single();

          if (error) throw error;

          // Approve the entry
          const { error: approveError } = await supabase
            .from('time_entries')
            .update({ approval_status: 'approved' })
            .eq('id', newEntry.id);

          if (approveError) throw approveError;

          console.log(`  ✓ Time entry created & approved: ${entry.email} - ${entry.project} (${entry.hours}h)`);
        } else {
          console.log(`  ✓ Time entry exists: ${entry.email} - ${entry.project}`);
        }
      }
    }

    console.log('\n✅ Demo provisioning completed successfully!');
  } catch (error) {
    console.error('\n❌ Provisioning failed:', error.message);
    process.exit(1);
  }
}

provision();
