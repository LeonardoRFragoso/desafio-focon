#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import process from 'process';

const isDryRun = process.argv.includes('--dry-run');

// Dry-run mode: no environment validation needed
if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made');
  console.log('\n📋 Planned operations:');
  console.log('  1. Create/locate users: ana, bruno, carla, admin');
  console.log('  2. Ensure profiles with correct roles');
  console.log('  3. Create projects: Residencial Aurora, Edifício Horizonte');
  console.log('  4. Create project financials');
  console.log('  5. Create hourly rates');
  console.log('  6. Create time entries (pending)');
  console.log('  7. Approve time entries');
  console.log('\n✅ Dry run validation passed');
  process.exit(0);
}

// Real execution: validate environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_USER_PASSWORD',
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please set them in .env.provision.local');
  console.error('\nUsage: node --env-file=.env.provision.local scripts/provision-remote-demo.mjs');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoPassword = process.env.DEMO_USER_PASSWORD;

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

async function findUserByEmail(email) {
  const perPage = 100;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    const user = data.users.find(
      candidate => candidate.email?.toLowerCase() === email.toLowerCase()
    );

    if (user) return user;
    if (data.users.length < perPage) return null;

    page += 1;
  }
}

async function findOrCreateUser(email, fullName) {
  // First, try to find existing user
  let user = await findUserByEmail(email);

  if (user) {
    // User exists - update to ensure password, confirmation, and metadata
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: demoPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (updateError) {
      throw new Error(`Failed to update user ${email}: ${updateError.message}`);
    }

    if (!updatedUser || !updatedUser.user) {
      throw new Error(`No user returned after update for ${email}`);
    }

    return updatedUser.user;
  }

  // User doesn't exist - create it
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    throw new Error(`Failed to create user ${email}: ${createError.message}`);
  }

  if (!newUser || !newUser.user) {
    throw new Error(`No user returned after creation for ${email}`);
  }

  return newUser.user;
}

async function provision() {
  try {
    console.log('🚀 Starting demo provisioning...\n');

    // Step 1: Process users
    console.log('📝 Processing users...');
    const userMap = new Map();

    for (const user of USERS) {
      try {
        const authUser = await findOrCreateUser(user.email, user.fullName);

        if (!authUser.id) {
          throw new Error(`Failed to get user ID for ${user.email}`);
        }

        userMap.set(user.email, { id: authUser.id, ...user });
        console.log(`  ✓ User processed: ${user.email}`);
      } catch (error) {
        throw new Error(`Failed to process user ${user.email}: ${error.message}`);
      }
    }

    // Step 2: Ensure profiles
    console.log('\n📋 Ensuring profiles...');
    for (const [email, userData] of userMap) {
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userData.id,
            full_name: userData.fullName,
            role: userData.role,
          },
          { onConflict: 'id' }
        );

      if (upsertError) throw new Error(`Failed to upsert profile for ${email}: ${upsertError.message}`);
      console.log(`  ✓ Profile ensured: ${email} (${userData.role})`);
    }

    // Step 3: Create projects
    console.log('\n🏗️  Creating projects...');
    const projectMap = new Map();

    for (const project of PROJECTS) {
      const { data: existingProject, error: selectError } = await supabase
        .from('projects')
        .select('id')
        .eq('name', project.name)
        .maybeSingle();

      if (selectError) throw new Error(`Failed to query project ${project.name}: ${selectError.message}`);

      let projectId;
      if (existingProject) {
        projectId = existingProject.id;
        console.log(`  ✓ Project exists: ${project.name}`);
      } else {
        const { data: newProject, error: insertError } = await supabase
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

        if (insertError) throw new Error(`Failed to create project ${project.name}: ${insertError.message}`);
        projectId = newProject.id;
        console.log(`  ✓ Project created: ${project.name}`);
      }

      projectMap.set(project.name, { id: projectId, ...project });
    }

    // Step 4: Create project financials
    console.log('\n💰 Creating project financials...');
    for (const [projectName, projectData] of projectMap) {
      const { data: existingFinancial, error: selectError } = await supabase
        .from('project_financials')
        .select('project_id')
        .eq('project_id', projectData.id)
        .maybeSingle();

      if (selectError) throw new Error(`Failed to query financials for ${projectName}: ${selectError.message}`);

      if (!existingFinancial) {
        const { error: insertError } = await supabase
          .from('project_financials')
          .insert([
            {
              project_id: projectData.id,
              contracted_revenue: projectData.revenue,
              tax_rate: projectData.taxRate,
              indirect_cost: projectData.indirectCost,
            },
          ]);

        if (insertError) throw new Error(`Failed to create financials for ${projectName}: ${insertError.message}`);
        console.log(`  ✓ Financial data created: ${projectName}`);
      } else {
        console.log(`  ✓ Financial data exists: ${projectName}`);
      }
    }

    // Step 5: Create hourly rates
    console.log('\n💵 Creating hourly rates...');
    for (const rate of HOURLY_RATES) {
      const userData = userMap.get(rate.email);
      if (!userData) {
        throw new Error(`User ${rate.email} not found in userMap`);
      }

      const { data: existingRate, error: selectError } = await supabase
        .from('hourly_rates')
        .select('id')
        .eq('professional_id', userData.id)
        .eq('valid_from', rate.validFrom)
        .maybeSingle();

      if (selectError) throw new Error(`Failed to query hourly rate for ${rate.email}: ${selectError.message}`);

      if (!existingRate) {
        const { error: insertError } = await supabase
          .from('hourly_rates')
          .insert([
            {
              professional_id: userData.id,
              hourly_rate: rate.rate,
              valid_from: rate.validFrom,
              valid_until: rate.validUntil,
            },
          ]);

        if (insertError) throw new Error(`Failed to create hourly rate for ${rate.email}: ${insertError.message}`);
        console.log(`  ✓ Hourly rate created: ${rate.email} (R$ ${rate.rate}/h)`);
      } else {
        console.log(`  ✓ Hourly rate exists: ${rate.email}`);
      }
    }

    // Step 6: Create time entries
    console.log('\n⏱️  Creating time entries...');
    for (const entry of TIME_ENTRIES) {
      const userData = userMap.get(entry.email);
      const projectData = projectMap.get(entry.project);

      if (!userData) {
        throw new Error(`User ${entry.email} not found in userMap`);
      }
      if (!projectData) {
        throw new Error(`Project ${entry.project} not found in projectMap`);
      }

      // Check if entry already exists
      const { data: existingEntry, error: selectError } = await supabase
        .from('time_entries')
        .select('id, approval_status, applied_hourly_rate')
        .eq('professional_id', userData.id)
        .eq('project_id', projectData.id)
        .eq('entry_date', entry.date)
        .eq('description', entry.description)
        .maybeSingle();

      if (selectError) throw new Error(`Failed to query time entry: ${selectError.message}`);

      if (existingEntry) {
        // Entry exists - ensure it's approved and has a rate
        if (existingEntry.approval_status !== 'approved') {
          const { error: updateError } = await supabase
            .from('time_entries')
            .update({ approval_status: 'approved' })
            .eq('id', existingEntry.id);

          if (updateError) throw new Error(`Failed to approve existing entry: ${updateError.message}`);
          console.log(`  ✓ Time entry approved: ${entry.email} - ${entry.project} (${entry.hours}h)`);
        } else {
          console.log(`  ✓ Time entry exists (approved): ${entry.email} - ${entry.project}`);
        }

        if (!existingEntry.applied_hourly_rate || existingEntry.applied_hourly_rate <= 0) {
          throw new Error(`Entry exists but has no valid hourly rate: ${existingEntry.id}`);
        }
      } else {
        // Create new entry
        const { data: newEntry, error: insertError } = await supabase
          .from('time_entries')
          .insert([
            {
              professional_id: userData.id,
              project_id: projectData.id,
              entry_date: entry.date,
              duration_minutes: entry.hours * 60,
              description: entry.description,
              approval_status: 'pending',
              applied_hourly_rate: 0, // Will be set by trigger
            },
          ])
          .select('id, applied_hourly_rate')
          .single();

        if (insertError) throw new Error(`Failed to create time entry: ${insertError.message}`);

        if (!newEntry.id) {
          throw new Error('Failed to get ID of newly created time entry');
        }

        // Approve the entry
        const { error: approveError } = await supabase
          .from('time_entries')
          .update({ approval_status: 'approved' })
          .eq('id', newEntry.id);

        if (approveError) throw new Error(`Failed to approve time entry: ${approveError.message}`);

        // Fetch to verify rate was set
        const { data: verifyEntry, error: verifyError } = await supabase
          .from('time_entries')
          .select('applied_hourly_rate')
          .eq('id', newEntry.id)
          .single();

        if (verifyError) throw new Error(`Failed to verify time entry: ${verifyError.message}`);
        if (!verifyEntry.applied_hourly_rate || verifyEntry.applied_hourly_rate <= 0) {
          throw new Error(`Time entry created but hourly rate not set: ${newEntry.id}`);
        }

        console.log(`  ✓ Time entry created & approved: ${entry.email} - ${entry.project} (${entry.hours}h, R$ ${verifyEntry.applied_hourly_rate}/h)`);
      }
    }

    console.log('\n✅ Demo provisioning completed successfully!');
  } catch (error) {
    console.error('\n❌ Provisioning failed:', error.message);
    process.exit(1);
  }
}

provision();
