#!/usr/bin/env node

/**
 * FoconFlow demo data provisioning script.
 *
 * Usage:
 *   node scripts/provision-remote-demo.mjs --dry-run
 *   node scripts/provision-remote-demo.mjs --apply
 *
 * --dry-run:  Connects to the database (read-only) and reports what exists
 *             vs what would be created. No mutations.
 * --apply:    Creates/updates all demo data. Requires explicit confirmation
 *             unless --yes is also passed.
 * --yes:      Skip confirmation prompt (for CI/automated use).
 *
 * Environment (for both modes):
 *   SUPABASE_URL              - Project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (bypasses RLS)
 *   DEMO_USER_PASSWORD        - Password for demo users
 *
 * Usage with env file:
 *   node --env-file=.env.provision.local scripts/provision-remote-demo.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import process from 'process';
import readline from 'readline';

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isApply = args.has('--apply');
const skipConfirm = args.has('--yes');

if (!isDryRun && !isApply) {
  console.error('❌ Must specify either --dry-run or --apply');
  console.error('Usage: node scripts/provision-remote-demo.mjs --dry-run');
  console.error('       node scripts/provision-remote-demo.mjs --apply [--yes]');
  process.exit(1);
}

if (isDryRun && isApply) {
  console.error('❌ Cannot specify both --dry-run and --apply');
  process.exit(1);
}

// Validate environment variables (needed for both modes to connect)
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_USER_PASSWORD',
];

const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please set them in .env.provision.local');
  console.error('\nUsage: node --env-file=.env.provision.local scripts/provision-remote-demo.mjs --dry-run');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoPassword = process.env.DEMO_USER_PASSWORD;

const supabase = createClient(supabaseUrl, serviceRoleKey);

// --- Data definitions ---

const USERS = [
  { email: 'ana@example.com', fullName: 'Ana Silva', role: 'member' },
  { email: 'bruno@example.com', fullName: 'Bruno Santos', role: 'member' },
  { email: 'carla@example.com', fullName: 'Carla Oliveira', role: 'member' },
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

// Approved entries (for historical data / dashboard validation)
const APPROVED_ENTRIES = [
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

// Pending entries (for approval flow validation)
const PENDING_ENTRIES = [
  { email: 'ana@example.com', project: 'Residencial Aurora', date: '2024-08-12', hours: 7, description: 'Inspeção em campo — fundações' },
  { email: 'bruno@example.com', project: 'Residencial Aurora', date: '2024-08-12', hours: 5, description: 'Análise de patologias estruturais' },
  { email: 'carla@example.com', project: 'Edifício Horizonte', date: '2024-08-26', hours: 6, description: 'Reunião de alinhamento com cliente' },
  { email: 'ana@example.com', project: 'Edifício Horizonte', date: '2024-08-26', hours: 3, description: 'Atualização de cronograma' },
];

// Accounting periods (for period close/reopen validation)
const ACCOUNTING_PERIODS = [
  { period: '2024-08', status: 'closed' },
  { period: '2024-09', status: 'open' },
];

// Project budgets (for budget vs actual validation)
const PROJECT_BUDGETS = [
  { project: 'Residencial Aurora', period: '2024-08', budgetedHours: 160, budgetedRevenue: 20000 },
  { project: 'Edifício Horizonte', period: '2024-08', budgetedHours: 100, budgetedRevenue: 12000 },
];

// --- Helpers ---

async function findUserByEmail(email) {
  const perPage = 100;
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const user = data.users.find((c) => c.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

function confirm(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// --- Dry run (read-only validation) ---

async function dryRun() {
  console.log('🔍 DRY RUN MODE — Read-only validation, no changes will be made\n');

  const report = { users: { exist: 0, missing: 0 }, projects: { exist: 0, missing: 0 }, rates: { exist: 0, missing: 0 }, approved: { exist: 0, missing: 0 }, pending: { exist: 0, missing: 0 }, periods: { exist: 0, missing: 0 }, budgets: { exist: 0, missing: 0 } };

  // Check users
  console.log('📝 Checking users...');
  const userMap = new Map();
  for (const user of USERS) {
    const authUser = await findUserByEmail(user.email);
    if (authUser) {
      report.users.exist++;
      userMap.set(user.email, { id: authUser.id, ...user });
      console.log(`  ✓ Exists: ${user.email} (${user.role})`);
    } else {
      report.users.missing++;
      console.log(`  ✗ Missing: ${user.email} — will be created`);
    }
  }

  // Check profiles
  console.log('\n📋 Checking profiles...');
  for (const [email, userData] of userMap) {
    const { data: profile } = await supabase.from('profiles').select('id, role').eq('id', userData.id).maybeSingle();
    if (profile) {
      console.log(`  ✓ Profile exists: ${email} (role: ${profile.role})`);
    } else {
      console.log(`  ✗ Profile missing: ${email} — will be created`);
    }
  }

  // Check projects
  console.log('\n🏗️  Checking projects...');
  const projectMap = new Map();
  for (const project of PROJECTS) {
    const { data: existing } = await supabase.from('projects').select('id').eq('name', project.name).maybeSingle();
    if (existing) {
      report.projects.exist++;
      projectMap.set(project.name, { id: existing.id, ...project });
      console.log(`  ✓ Exists: ${project.name}`);
    } else {
      report.projects.missing++;
      console.log(`  ✗ Missing: ${project.name} — will be created`);
    }
  }

  // Check hourly rates
  console.log('\n💵 Checking hourly rates...');
  for (const rate of HOURLY_RATES) {
    const userData = userMap.get(rate.email);
    if (!userData) { console.log(`  ⊘ Skipped (user missing): ${rate.email}`); continue; }
    const { data: existing } = await supabase.from('hourly_rates').select('id').eq('professional_id', userData.id).eq('valid_from', rate.validFrom).maybeSingle();
    if (existing) { report.rates.exist++; console.log(`  ✓ Exists: ${rate.email} (R$ ${rate.rate}/h)`); }
    else { report.rates.missing++; console.log(`  ✗ Missing: ${rate.email} — will be created`); }
  }

  // Check approved time entries
  console.log('\n⏱️  Checking approved time entries...');
  for (const entry of APPROVED_ENTRIES) {
    const userData = userMap.get(entry.email);
    const projectData = projectMap.get(entry.project);
    if (!userData || !projectData) { console.log(`  ⊘ Skipped (user/project missing): ${entry.email} - ${entry.project}`); continue; }
    const { data: existing } = await supabase.from('time_entries').select('id, approval_status').eq('professional_id', userData.id).eq('project_id', projectData.id).eq('entry_date', entry.date).eq('description', entry.description).maybeSingle();
    if (existing) { report.approved.exist++; console.log(`  ✓ Exists: ${entry.email} - ${entry.project} (${entry.hours}h)`); }
    else { report.approved.missing++; console.log(`  ✗ Missing: ${entry.email} - ${entry.project} (${entry.hours}h) — will be created`); }
  }

  // Check pending time entries
  console.log('\n⏳ Checking pending time entries...');
  for (const entry of PENDING_ENTRIES) {
    const userData = userMap.get(entry.email);
    const projectData = projectMap.get(entry.project);
    if (!userData || !projectData) { console.log(`  ⊘ Skipped (user/project missing): ${entry.email} - ${entry.project}`); continue; }
    const { data: existing } = await supabase.from('time_entries').select('id, approval_status').eq('professional_id', userData.id).eq('project_id', projectData.id).eq('entry_date', entry.date).eq('description', entry.description).maybeSingle();
    if (existing) { report.pending.exist++; console.log(`  ✓ Exists: ${entry.email} - ${entry.project} (${entry.hours}h, ${existing.approval_status})`); }
    else { report.pending.missing++; console.log(`  ✗ Missing: ${entry.email} - ${entry.project} (${entry.hours}h) — will be created as pending`); }
  }

  // Check accounting periods
  console.log('\n📅 Checking accounting periods...');
  for (const period of ACCOUNTING_PERIODS) {
    const { data: existing } = await supabase.from('accounting_periods').select('id, status').eq('period', period.period).maybeSingle();
    if (existing) { report.periods.exist++; console.log(`  ✓ Exists: ${period.period} (status: ${existing.status})`); }
    else { report.periods.missing++; console.log(`  ✗ Missing: ${period.period} — will be created (${period.status})`); }
  }

  // Check project budgets
  console.log('\n📊 Checking project budgets...');
  for (const budget of PROJECT_BUDGETS) {
    const projectData = projectMap.get(budget.project);
    if (!projectData) { console.log(`  ⊘ Skipped (project missing): ${budget.project}`); continue; }
    const { data: existing } = await supabase.from('project_budgets').select('id').eq('project_id', projectData.id).eq('period', budget.period).maybeSingle();
    if (existing) { report.budgets.exist++; console.log(`  ✓ Exists: ${budget.project} - ${budget.period}`); }
    else { report.budgets.missing++; console.log(`  ✗ Missing: ${budget.project} - ${budget.period} — will be created`); }
  }

  // Summary
  console.log('\n📋 DRY RUN SUMMARY');
  console.log('  ─────────────────────────────────────');
  console.log(`  Users:     ${report.users.exist} exist, ${report.users.missing} to create`);
  console.log(`  Projects:  ${report.projects.exist} exist, ${report.projects.missing} to create`);
  console.log(`  Rates:     ${report.rates.exist} exist, ${report.rates.missing} to create`);
  console.log(`  Approved:  ${report.approved.exist} exist, ${report.approved.missing} to create`);
  console.log(`  Pending:   ${report.pending.exist} exist, ${report.pending.missing} to create`);
  console.log(`  Periods:   ${report.periods.exist} exist, ${report.periods.missing} to create`);
  console.log(`  Budgets:   ${report.budgets.exist} exist, ${report.budgets.missing} to create`);
  console.log('  ─────────────────────────────────────');
  const totalNew = report.users.missing + report.projects.missing + report.rates.missing + report.approved.missing + report.pending.missing + report.periods.missing + report.budgets.missing;
  console.log(`  Total new records to create: ${totalNew}`);
  console.log('\n✅ Dry run validation passed. Run with --apply to create missing records.');
}

// --- Apply (create/update) ---

async function findOrCreateUser(email, fullName) {
  let user = await findUserByEmail(email);
  if (user) {
    const { data: updated, error } = await supabase.auth.admin.updateUserById(user.id, {
      password: demoPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`Failed to update user ${email}: ${error.message}`);
    return updated.user;
  }
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`Failed to create user ${email}: ${error.message}`);
  return newUser.user;
}

async function apply() {
  console.log('🚀 APPLY MODE — Demo data will be created/updated in the database\n');

  if (!skipConfirm) {
    console.log('⚠️  WARNING: This will modify the production database.');
    console.log('   Target:', supabaseUrl);
    console.log('   Operations:');
    console.log(`     - ${USERS.length} users (create or update)`);
    console.log(`     - ${PROJECTS.length} projects (create if missing)`);
    console.log(`     - ${HOURLY_RATES.length} hourly rates (create if missing)`);
    console.log(`     - ${APPROVED_ENTRIES.length} approved time entries (create if missing)`);
    console.log(`     - ${PENDING_ENTRIES.length} pending time entries (create if missing)`);
    console.log(`     - ${ACCOUNTING_PERIODS.length} accounting periods (create if missing)`);
    console.log(`     - ${PROJECT_BUDGETS.length} project budgets (create if missing)`);
    console.log('');
    const ok = await confirm('Type "yes" to confirm and proceed: ');
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
    console.log('');
  }

  let created = 0;
  let skipped = 0;

  // Step 1: Users
  console.log('📝 Processing users...');
  const userMap = new Map();
  for (const user of USERS) {
    const authUser = await findOrCreateUser(user.email, user.fullName);
    userMap.set(user.email, { id: authUser.id, ...user });
    console.log(`  ✓ ${user.email}`);
  }

  // Step 2: Profiles
  console.log('\n📋 Ensuring profiles...');
  for (const [email, userData] of userMap) {
    const { data: existing } = await supabase.from('profiles').select('id').eq('id', userData.id).maybeSingle();
    if (existing) {
      await supabase.from('profiles').update({ full_name: userData.fullName, role: userData.role }).eq('id', userData.id);
      skipped++;
      console.log(`  ✓ Updated: ${email} (${userData.role})`);
    } else {
      await supabase.from('profiles').insert([{ id: userData.id, full_name: userData.fullName, role: userData.role }]);
      created++;
      console.log(`  ✓ Created: ${email} (${userData.role})`);
    }
  }

  // Step 3: Projects
  console.log('\n🏗️  Creating projects...');
  const projectMap = new Map();
  for (const project of PROJECTS) {
    const { data: existing } = await supabase.from('projects').select('id').eq('name', project.name).maybeSingle();
    if (existing) {
      projectMap.set(project.name, { id: existing.id, ...project });
      skipped++;
      console.log(`  ✓ Exists: ${project.name}`);
    } else {
      const { data: newProject } = await supabase.from('projects').insert([{ name: project.name, client: project.client, status: project.status, start_date: project.startDate, end_date: project.endDate }]).select('id').single();
      projectMap.set(project.name, { id: newProject.id, ...project });
      created++;
      console.log(`  ✓ Created: ${project.name}`);
    }
  }

  // Step 4: Project financials
  console.log('\n💰 Creating project financials...');
  for (const [name, data] of projectMap) {
    const { data: existing } = await supabase.from('project_financials').select('project_id').eq('project_id', data.id).maybeSingle();
    if (!existing) {
      await supabase.from('project_financials').insert([{ project_id: data.id, contracted_revenue: data.revenue, tax_rate: data.taxRate, indirect_cost: data.indirectCost }]);
      created++;
      console.log(`  ✓ Created: ${name}`);
    } else {
      skipped++;
      console.log(`  ✓ Exists: ${name}`);
    }
  }

  // Step 5: Hourly rates
  console.log('\n💵 Creating hourly rates...');
  for (const rate of HOURLY_RATES) {
    const userData = userMap.get(rate.email);
    if (!userData) continue;
    const { data: existing } = await supabase.from('hourly_rates').select('id').eq('professional_id', userData.id).eq('valid_from', rate.validFrom).maybeSingle();
    if (!existing) {
      await supabase.from('hourly_rates').insert([{ professional_id: userData.id, hourly_rate: rate.rate, valid_from: rate.validFrom, valid_until: rate.validUntil }]);
      created++;
      console.log(`  ✓ Created: ${rate.email} (R$ ${rate.rate}/h)`);
    } else {
      skipped++;
      console.log(`  ✓ Exists: ${rate.email}`);
    }
  }

  // Step 6: Approved time entries
  console.log('\n⏱️  Creating approved time entries...');
  for (const entry of APPROVED_ENTRIES) {
    const userData = userMap.get(entry.email);
    const projectData = projectMap.get(entry.project);
    if (!userData || !projectData) continue;
    const { data: existing } = await supabase.from('time_entries').select('id, approval_status, applied_hourly_rate').eq('professional_id', userData.id).eq('project_id', projectData.id).eq('entry_date', entry.date).eq('description', entry.description).maybeSingle();
    if (existing) {
      if (existing.approval_status !== 'approved') {
        await supabase.from('time_entries').update({ approval_status: 'approved' }).eq('id', existing.id);
        console.log(`  ✓ Approved: ${entry.email} - ${entry.project} (${entry.hours}h)`);
      } else {
        skipped++;
        console.log(`  ✓ Exists (approved): ${entry.email} - ${entry.project}`);
      }
    } else {
      await supabase.from('time_entries').insert([{ professional_id: userData.id, project_id: projectData.id, entry_date: entry.date, duration_minutes: entry.hours * 60, description: entry.description, approval_status: 'approved', applied_hourly_rate: 0 }]);
      created++;
      console.log(`  ✓ Created (approved): ${entry.email} - ${entry.project} (${entry.hours}h)`);
    }
  }

  // Step 7: Pending time entries (for approval flow validation)
  console.log('\n⏳ Creating pending time entries...');
  for (const entry of PENDING_ENTRIES) {
    const userData = userMap.get(entry.email);
    const projectData = projectMap.get(entry.project);
    if (!userData || !projectData) continue;
    const { data: existing } = await supabase.from('time_entries').select('id').eq('professional_id', userData.id).eq('project_id', projectData.id).eq('entry_date', entry.date).eq('description', entry.description).maybeSingle();
    if (existing) {
      skipped++;
      console.log(`  ✓ Exists: ${entry.email} - ${entry.project}`);
    } else {
      await supabase.from('time_entries').insert([{ professional_id: userData.id, project_id: projectData.id, entry_date: entry.date, duration_minutes: entry.hours * 60, description: entry.description, approval_status: 'pending', applied_hourly_rate: 0 }]);
      created++;
      console.log(`  ✓ Created (pending): ${entry.email} - ${entry.project} (${entry.hours}h)`);
    }
  }

  // Step 8: Accounting periods
  console.log('\n📅 Creating accounting periods...');
  for (const period of ACCOUNTING_PERIODS) {
    const { data: existing } = await supabase.from('accounting_periods').select('id').eq('period', period.period).maybeSingle();
    if (!existing) {
      await supabase.from('accounting_periods').insert([{ period: period.period, status: period.status }]);
      created++;
      console.log(`  ✓ Created: ${period.period} (${period.status})`);
    } else {
      skipped++;
      console.log(`  ✓ Exists: ${period.period}`);
    }
  }

  // Step 9: Project budgets
  console.log('\n📊 Creating project budgets...');
  for (const budget of PROJECT_BUDGETS) {
    const projectData = projectMap.get(budget.project);
    if (!projectData) continue;
    const { data: existing } = await supabase.from('project_budgets').select('id').eq('project_id', projectData.id).eq('period', budget.period).maybeSingle();
    if (!existing) {
      await supabase.from('project_budgets').insert([{ project_id: projectData.id, period: budget.period, budgeted_hours: budget.budgetedHours, budgeted_revenue: budget.budgetedRevenue }]);
      created++;
      console.log(`  ✓ Created: ${budget.project} - ${budget.period}`);
    } else {
      skipped++;
      console.log(`  ✓ Exists: ${budget.project} - ${budget.period}`);
    }
  }

  // Summary
  console.log('\n📋 APPLY SUMMARY');
  console.log('  ─────────────────────────────────────');
  console.log(`  Records created: ${created}`);
  console.log(`  Records skipped (already exist): ${skipped}`);
  console.log('  ─────────────────────────────────────');
  console.log('\n✅ Demo data provisioning complete.');
  console.log('   Demo credentials:');
  console.log('   ana@example.com / bruno@example.com / carla@example.com / admin@example.com');
  console.log(`   Password: ${demoPassword}`);
}

// --- Main ---

async function main() {
  try {
    if (isDryRun) {
      await dryRun();
    } else {
      await apply();
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
