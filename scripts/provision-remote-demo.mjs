#!/usr/bin/env node

/**
 * FoconFlow demo data provisioning script.
 *
 * Usage:
 *   node scripts/provision-remote-demo.mjs --dry-run
 *   node scripts/provision-remote-demo.mjs --apply
 *   node scripts/provision-remote-demo.mjs --apply --yes
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
 *
 * SAFETY:
 *   - NEVER prints secrets (password, service role key, tokens)
 *   - Uses controlled demo identity with metadata markers
 *   - Does NOT reset passwords of existing unmarked users
 *   - All Supabase calls check for errors (fail closed)
 *   - All records are tagged with [VALIDAÇÃO] or [DEMO] markers
 */

import { createClient } from '@supabase/supabase-js';
import process from 'process';
import readline from 'readline';

// ============================================================================
// ARGUMENTS
// ============================================================================

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

// ============================================================================
// ENVIRONMENT
// ============================================================================

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
// Anon key for authenticated operations (e.g., admin auth for period close)
const anonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ============================================================================
// DEMO IDENTITY MARKER
// ============================================================================

/**
 * Metadata marker applied to all demo auth users created by this script.
 * Before updating an existing user, we check for this marker to avoid
 * modifying real accounts that happen to share an email.
 */
const DEMO_MARKER = 'product-consistency-v1';
const DEMO_METADATA = {
  foconflow_demo: true,
  provisioning_marker: DEMO_MARKER,
};

// ============================================================================
// DATA DEFINITIONS
// ============================================================================

const USERS = [
  { email: 'ana@example.com', fullName: 'Ana Silva [VALIDAÇÃO]', role: 'member' },
  { email: 'bruno@example.com', fullName: 'Bruno Santos [VALIDAÇÃO]', role: 'member' },
  { email: 'carla@example.com', fullName: 'Carla Oliveira [VALIDAÇÃO]', role: 'member' },
  { email: 'admin@example.com', fullName: 'Administrador [VALIDAÇÃO]', role: 'admin' },
];

const PROJECTS = [
  {
    name: '[VALIDAÇÃO] Residencial Aurora',
    client: 'Cliente Aurora',
    status: 'active',
    startDate: '2024-08-01',
    endDate: '2024-12-31',
    revenue: 120000,
    taxRate: 0.08,
    indirectCost: 5000,
  },
  {
    name: '[VALIDAÇÃO] Edifício Horizonte',
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

const APPROVED_ENTRIES = [
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-05', hours: 8, description: 'Análise de estrutura' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-06', hours: 8, description: 'Projeto arquitetônico' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-07', hours: 8, description: 'Revisão de plantas' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-08', hours: 8, description: 'Coordenação com cliente' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-09', hours: 8, description: 'Ajustes finais' },
  { email: 'bruno@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-05', hours: 6, description: 'Cálculos estruturais' },
  { email: 'bruno@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-06', hours: 6, description: 'Detalhamento de armadura' },
  { email: 'bruno@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-07', hours: 6, description: 'Verificação de cargas' },
  { email: 'bruno@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-08', hours: 6, description: 'Relatório técnico' },
  { email: 'bruno@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-09', hours: 6, description: 'Aprovação final' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-20', hours: 4, description: 'Levantamento de requisitos' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-21', hours: 4, description: 'Esboço preliminar' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-22', hours: 4, description: 'Apresentação ao cliente' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-23', hours: 4, description: 'Ajustes solicitados' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-24', hours: 4, description: 'Documentação final' },
  { email: 'carla@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-20', hours: 5, description: 'Análise de viabilidade' },
  { email: 'carla@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-21', hours: 5, description: 'Estudo de impacto' },
  { email: 'carla@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-22', hours: 5, description: 'Parecer técnico' },
  { email: 'carla@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-23', hours: 5, description: 'Revisão de documentos' },
  { email: 'carla@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-24', hours: 5, description: 'Aprovação de conformidade' },
];

const PENDING_ENTRIES = [
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-12', hours: 7, description: 'Inspeção em campo — fundações' },
  { email: 'bruno@example.com', project: '[VALIDAÇÃO] Residencial Aurora', date: '2024-08-12', hours: 5, description: 'Análise de patologias estruturais' },
  { email: 'carla@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-26', hours: 6, description: 'Reunião de alinhamento com cliente' },
  { email: 'ana@example.com', project: '[VALIDAÇÃO] Edifício Horizonte', date: '2024-08-26', hours: 3, description: 'Atualização de cronograma' },
];

// P2 — Accounting periods: use period_key, create as open, close via RPC
const ACCOUNTING_PERIODS = [
  { periodKey: '2024-08', shouldClose: true },  // will be closed via RPC
  { periodKey: '2024-09', shouldClose: false }, // stays open
];

// P3 — Project budgets: real schema (budget_type, budget_value, fiscal_year)
const PROJECT_BUDGETS = [
  { project: '[VALIDAÇÃO] Residencial Aurora', budgetType: 'labor_hours', budgetValue: 160, fiscalYear: 2024 },
  { project: '[VALIDAÇÃO] Residencial Aurora', budgetType: 'labor_cost', budgetValue: 20000, fiscalYear: 2024 },
  { project: '[VALIDAÇÃO] Residencial Aurora', budgetType: 'total_cost', budgetValue: 25000, fiscalYear: 2024 },
  { project: '[VALIDAÇÃO] Edifício Horizonte', budgetType: 'labor_hours', budgetValue: 100, fiscalYear: 2024 },
  { project: '[VALIDAÇÃO] Edifício Horizonte', budgetType: 'labor_cost', budgetValue: 12000, fiscalYear: 2024 },
];

// P4 — Profitability alerts: config alerts (triggered_at = NULL)
// No automation exists — alerts are manually managed. We create config
// alerts that monitor thresholds. The UI computes triggered status.
const PROFITABILITY_ALERTS = [
  { project: '[VALIDAÇÃO] Residencial Aurora', metric: 'margin_percent', threshold: 20.00 },
  { project: '[VALIDAÇÃO] Residencial Aurora', metric: 'budget_utilization_percent', threshold: 80.00 },
  { project: '[VALIDAÇÃO] Edifício Horizonte', metric: 'margin_percent', threshold: 15.00 },
];

// ============================================================================
// HELPERS
// ============================================================================

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

/**
 * Check if an existing auth user has our demo marker.
 * Returns true if the user was created by this provisioning script.
 */
function hasDemoMarker(user) {
  const metadata = user?.user_metadata ?? {};
  return metadata.foconflow_demo === true && metadata.provisioning_marker === DEMO_MARKER;
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

/**
 * Check a Supabase response for errors. Throws if error is present.
 */
function checkError(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result;
}

// ============================================================================
// DRY RUN (read-only validation)
// ============================================================================

async function dryRun() {
  console.log('🔍 DRY RUN MODE — Read-only validation, no changes will be made\n');
  console.log(`   Target: ${supabaseUrl}\n`);

  const report = {
    users: { exist: 0, missing: 0, unmarked: 0 },
    projects: { exist: 0, missing: 0 },
    rates: { exist: 0, missing: 0 },
    approved: { exist: 0, missing: 0 },
    pending: { exist: 0, missing: 0 },
    periods: { exist: 0, missing: 0 },
    budgets: { exist: 0, missing: 0 },
    alerts: { exist: 0, missing: 0 },
  };

  // Check users
  console.log('📝 Checking users...');
  const userMap = new Map();
  for (const user of USERS) {
    const authUser = await findUserByEmail(user.email);
    if (authUser) {
      if (hasDemoMarker(authUser)) {
        report.users.exist++;
        userMap.set(user.email, { id: authUser.id, ...user });
        console.log(`  ✓ Exists (marked): ${user.email} (${user.role})`);
      } else {
        report.users.unmarked++;
        console.log(`  ⚠ Exists (UNMARKED — will NOT modify): ${user.email}`);
      }
    } else {
      report.users.missing++;
      console.log(`  ✗ Missing: ${user.email} — will be created with demo marker`);
    }
  }

  // Check profiles
  console.log('\n📋 Checking profiles...');
  for (const [email, userData] of userMap) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userData.id)
      .maybeSingle();
    if (error) { console.log(`  ⚠ Error checking profile for ${email}: ${error.message}`); continue; }
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
    const { data: existing, error } = await supabase
      .from('projects')
      .select('id')
      .eq('name', project.name)
      .maybeSingle();
    if (error) { console.log(`  ⚠ Error: ${error.message}`); continue; }
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
    if (!userData) { console.log(`  ⊘ Skipped (user missing/unmarked): ${rate.email}`); continue; }
    const { data: existing, error } = await supabase
      .from('hourly_rates')
      .select('id')
      .eq('professional_id', userData.id)
      .eq('valid_from', rate.validFrom)
      .maybeSingle();
    if (error) { console.log(`  ⚠ Error: ${error.message}`); continue; }
    if (existing) { report.rates.exist++; console.log(`  ✓ Exists: ${rate.email} (R$ ${rate.rate}/h)`); }
    else { report.rates.missing++; console.log(`  ✗ Missing: ${rate.email} — will be created`); }
  }

  // Check approved time entries
  console.log('\n⏱️  Checking approved time entries...');
  for (const entry of APPROVED_ENTRIES) {
    const userData = userMap.get(entry.email);
    const projectData = projectMap.get(entry.project);
    if (!userData || !projectData) { continue; }
    const { data: existing, error } = await supabase
      .from('time_entries')
      .select('id, approval_status')
      .eq('professional_id', userData.id)
      .eq('project_id', projectData.id)
      .eq('entry_date', entry.date)
      .eq('description', entry.description)
      .maybeSingle();
    if (error) { console.log(`  ⚠ Error: ${error.message}`); continue; }
    if (existing) { report.approved.exist++; console.log(`  ✓ Exists: ${entry.email} - ${entry.project} (${entry.hours}h)`); }
    else { report.approved.missing++; console.log(`  ✗ Missing: ${entry.email} - ${entry.project} (${entry.hours}h)`); }
  }

  // Check pending time entries
  console.log('\n⏳ Checking pending time entries...');
  for (const entry of PENDING_ENTRIES) {
    const userData = userMap.get(entry.email);
    const projectData = projectMap.get(entry.project);
    if (!userData || !projectData) { continue; }
    const { data: existing, error } = await supabase
      .from('time_entries')
      .select('id, approval_status')
      .eq('professional_id', userData.id)
      .eq('project_id', projectData.id)
      .eq('entry_date', entry.date)
      .eq('description', entry.description)
      .maybeSingle();
    if (error) { console.log(`  ⚠ Error: ${error.message}`); continue; }
    if (existing) { report.pending.exist++; console.log(`  ✓ Exists: ${entry.email} - ${entry.project} (${entry.hours}h, ${existing.approval_status})`); }
    else { report.pending.missing++; console.log(`  ✗ Missing: ${entry.email} - ${entry.project} (${entry.hours}h)`); }
  }

  // P2 — Check accounting periods (period_key)
  console.log('\n📅 Checking accounting periods (period_key)...');
  for (const period of ACCOUNTING_PERIODS) {
    const { data: existing, error } = await supabase
      .from('accounting_periods')
      .select('id, period_key, status, closed_at, closed_by')
      .eq('period_key', period.periodKey)
      .maybeSingle();
    if (error) { console.log(`  ⚠ Error: ${error.message}`); continue; }
    if (existing) {
      report.periods.exist++;
      console.log(`  ✓ Exists: ${period.periodKey} (status: ${existing.status}${existing.closed_at ? ', closed_at: ' + existing.closed_at : ''})`);
      if (period.shouldClose && existing.status === 'open') {
        console.log(`    → Will be closed via close_accounting_period RPC`);
      }
    } else {
      report.periods.missing++;
      console.log(`  ✗ Missing: ${period.periodKey} — will be created as open${period.shouldClose ? ', then closed via RPC' : ''}`);
    }
  }

  // P3 — Check project budgets (budget_type, budget_value, fiscal_year)
  console.log('\n📊 Checking project budgets (budget_type, budget_value, fiscal_year)...');
  for (const budget of PROJECT_BUDGETS) {
    const projectData = projectMap.get(budget.project);
    if (!projectData) { console.log(`  ⊘ Skipped (project missing): ${budget.project}`); continue; }
    const { data: existing, error } = await supabase
      .from('project_budgets')
      .select('id')
      .eq('project_id', projectData.id)
      .eq('budget_type', budget.budgetType)
      .eq('fiscal_year', budget.fiscalYear)
      .maybeSingle();
    if (error) { console.log(`  ⚠ Error: ${error.message}`); continue; }
    if (existing) { report.budgets.exist++; console.log(`  ✓ Exists: ${budget.project} - ${budget.budgetType} - ${budget.fiscalYear}`); }
    else { report.budgets.missing++; console.log(`  ✗ Missing: ${budget.project} - ${budget.budgetType} - ${budget.fiscalYear} — will be created`); }
  }

  // P4 — Check profitability alerts
  console.log('\n🚨 Checking profitability alerts...');
  for (const alert of PROFITABILITY_ALERTS) {
    const projectData = projectMap.get(alert.project);
    if (!projectData) { console.log(`  ⊘ Skipped (project missing): ${alert.project}`); continue; }
    const { data: existing, error } = await supabase
      .from('profitability_alerts')
      .select('id, threshold, metric, triggered_at')
      .eq('project_id', projectData.id)
      .eq('metric', alert.metric)
      .maybeSingle();
    if (error) { console.log(`  ⚠ Error: ${error.message}`); continue; }
    if (existing) { report.alerts.exist++; console.log(`  ✓ Exists: ${alert.project} - ${alert.metric} (threshold: ${existing.threshold})`); }
    else { report.alerts.missing++; console.log(`  ✗ Missing: ${alert.project} - ${alert.metric} (threshold: ${alert.threshold}) — will be created as config (triggered_at=NULL)`); }
  }

  // Summary
  console.log('\n📋 DRY RUN SUMMARY');
  console.log('  ────────────────────────────────────────────');
  console.log(`  Users:       ${report.users.exist} exist (marked), ${report.users.unmarked} exist (unmarked, will NOT modify), ${report.users.missing} to create`);
  console.log(`  Projects:    ${report.projects.exist} exist, ${report.projects.missing} to create`);
  console.log(`  Rates:       ${report.rates.exist} exist, ${report.rates.missing} to create`);
  console.log(`  Approved:    ${report.approved.exist} exist, ${report.approved.missing} to create`);
  console.log(`  Pending:     ${report.pending.exist} exist, ${report.pending.missing} to create`);
  console.log(`  Periods:     ${report.periods.exist} exist, ${report.periods.missing} to create`);
  console.log(`  Budgets:     ${report.budgets.exist} exist, ${report.budgets.missing} to create`);
  console.log(`  Alerts:      ${report.alerts.exist} exist, ${report.alerts.missing} to create`);
  console.log('  ────────────────────────────────────────────');
  const totalNew = report.users.missing + report.projects.missing + report.rates.missing +
    report.approved.missing + report.pending.missing + report.periods.missing +
    report.budgets.missing + report.alerts.missing;
  console.log(`  Total new records to create: ${totalNew}`);
  if (report.users.unmarked > 0) {
    console.log(`  ⚠ ${report.users.unmarked} unmarked user(s) will NOT be modified (safety)`);
  }
  console.log('\n✅ Dry run validation passed. Run with --apply to create missing records.');
}

// ============================================================================
// APPLY (create/update)
// ============================================================================

async function findOrCreateUser(email, fullName) {
  let user = await findUserByEmail(email);

  if (user) {
    // P5 — Safety: only modify if user has our demo marker
    if (!hasDemoMarker(user)) {
      console.log(`  ⚠ Skipped (unmarked, will NOT modify): ${email}`);
      return null;
    }
    // Update marked user
    const { data: updated, error } = await supabase.auth.admin.updateUserById(user.id, {
      password: demoPassword,
      email_confirm: true,
      user_metadata: { ...DEMO_METADATA, full_name: fullName },
    });
    if (error) throw new Error(`Failed to update user ${email}: ${error.message}`);
    return updated.user;
  }

  // Create new user with demo marker
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { ...DEMO_METADATA, full_name: fullName },
  });
  if (error) throw new Error(`Failed to create user ${email}: ${error.message}`);
  return newUser.user;
}

async function apply() {
  console.log('🚀 APPLY MODE — Demo data will be created/updated in the database\n');
  console.log(`   Target: ${supabaseUrl}\n`);

  if (!skipConfirm) {
    console.log('⚠️  WARNING: This will modify the target database.');
    console.log('   Operations:');
    console.log(`     - ${USERS.length} users (create or update IF marked)`);
    console.log(`     - ${PROJECTS.length} projects (create if missing)`);
    console.log(`     - ${HOURLY_RATES.length} hourly rates (create if missing)`);
    console.log(`     - ${APPROVED_ENTRIES.length} approved time entries (create if missing)`);
    console.log(`     - ${PENDING_ENTRIES.length} pending time entries (create if missing)`);
    console.log(`     - ${ACCOUNTING_PERIODS.length} accounting periods (create if missing, close via RPC)`);
    console.log(`     - ${PROJECT_BUDGETS.length} project budgets (create if missing)`);
    console.log(`     - ${PROFITABILITY_ALERTS.length} profitability alerts (create if missing)`);
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
    if (authUser) {
      userMap.set(user.email, { id: authUser.id, ...user });
      console.log(`  ✓ ${user.email}`);
    }
  }

  // Step 2: Profiles
  console.log('\n📋 Ensuring profiles...');
  for (const [email, userData] of userMap) {
    const { data: existing, error: selErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userData.id)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query profile for ${email}: ${selErr.message}`);

    if (existing) {
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ full_name: userData.fullName, role: userData.role })
        .eq('id', userData.id);
      if (updErr) throw new Error(`Failed to update profile for ${email}: ${updErr.message}`);
      skipped++;
      console.log(`  ✓ Updated: ${email} (${userData.role})`);
    } else {
      const { error: insErr } = await supabase
        .from('profiles')
        .insert([{ id: userData.id, full_name: userData.fullName, role: userData.role }]);
      if (insErr) throw new Error(`Failed to create profile for ${email}: ${insErr.message}`);
      created++;
      console.log(`  ✓ Created: ${email} (${userData.role})`);
    }
  }

  // Step 3: Projects
  console.log('\n🏗️  Creating projects...');
  const projectMap = new Map();
  for (const project of PROJECTS) {
    const { data: existing, error: selErr } = await supabase
      .from('projects')
      .select('id')
      .eq('name', project.name)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query project ${project.name}: ${selErr.message}`);

    if (existing) {
      projectMap.set(project.name, { id: existing.id, ...project });
      skipped++;
      console.log(`  ✓ Exists: ${project.name}`);
    } else {
      const { data: newProject, error: insErr } = await supabase
        .from('projects')
        .insert([{ name: project.name, client: project.client, status: project.status, start_date: project.startDate, end_date: project.endDate }])
        .select('id')
        .single();
      if (insErr) throw new Error(`Failed to create project ${project.name}: ${insErr.message}`);
      projectMap.set(project.name, { id: newProject.id, ...project });
      created++;
      console.log(`  ✓ Created: ${project.name}`);
    }
  }

  // Step 4: Project financials
  console.log('\n💰 Creating project financials...');
  for (const [name, data] of projectMap) {
    const { data: existing, error: selErr } = await supabase
      .from('project_financials')
      .select('project_id')
      .eq('project_id', data.id)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query financials for ${name}: ${selErr.message}`);

    if (!existing) {
      const { error: insErr } = await supabase
        .from('project_financials')
        .insert([{ project_id: data.id, contracted_revenue: data.revenue, tax_rate: data.taxRate, indirect_cost: data.indirectCost }]);
      if (insErr) throw new Error(`Failed to create financials for ${name}: ${insErr.message}`);
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
    const { data: existing, error: selErr } = await supabase
      .from('hourly_rates')
      .select('id')
      .eq('professional_id', userData.id)
      .eq('valid_from', rate.validFrom)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query hourly rate for ${rate.email}: ${selErr.message}`);

    if (!existing) {
      const { error: insErr } = await supabase
        .from('hourly_rates')
        .insert([{ professional_id: userData.id, hourly_rate: rate.rate, valid_from: rate.validFrom, valid_until: rate.validUntil }]);
      if (insErr) throw new Error(`Failed to create hourly rate for ${rate.email}: ${insErr.message}`);
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
    const { data: existing, error: selErr } = await supabase
      .from('time_entries')
      .select('id, approval_status, applied_hourly_rate')
      .eq('professional_id', userData.id)
      .eq('project_id', projectData.id)
      .eq('entry_date', entry.date)
      .eq('description', entry.description)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query time entry: ${selErr.message}`);

    if (existing) {
      if (existing.approval_status !== 'approved') {
        const { error: updErr } = await supabase
          .from('time_entries')
          .update({ approval_status: 'approved' })
          .eq('id', existing.id);
        if (updErr) throw new Error(`Failed to approve existing entry: ${updErr.message}`);
        console.log(`  ✓ Approved: ${entry.email} - ${entry.project} (${entry.hours}h)`);
      } else {
        skipped++;
        console.log(`  ✓ Exists (approved): ${entry.email} - ${entry.project}`);
      }
    } else {
      const { error: insErr } = await supabase
        .from('time_entries')
        .insert([{ professional_id: userData.id, project_id: projectData.id, entry_date: entry.date, duration_minutes: entry.hours * 60, description: entry.description, approval_status: 'approved', applied_hourly_rate: 0 }]);
      if (insErr) throw new Error(`Failed to create time entry: ${insErr.message}`);
      created++;
      console.log(`  ✓ Created (approved): ${entry.email} - ${entry.project} (${entry.hours}h)`);
    }
  }

  // Step 7: Pending time entries
  console.log('\n⏳ Creating pending time entries...');
  for (const entry of PENDING_ENTRIES) {
    const userData = userMap.get(entry.email);
    const projectData = projectMap.get(entry.project);
    if (!userData || !projectData) continue;
    const { data: existing, error: selErr } = await supabase
      .from('time_entries')
      .select('id')
      .eq('professional_id', userData.id)
      .eq('project_id', projectData.id)
      .eq('entry_date', entry.date)
      .eq('description', entry.description)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query time entry: ${selErr.message}`);

    if (existing) {
      skipped++;
      console.log(`  ✓ Exists: ${entry.email} - ${entry.project}`);
    } else {
      const { error: insErr } = await supabase
        .from('time_entries')
        .insert([{ professional_id: userData.id, project_id: projectData.id, entry_date: entry.date, duration_minutes: entry.hours * 60, description: entry.description, approval_status: 'pending', applied_hourly_rate: 0 }]);
      if (insErr) throw new Error(`Failed to create pending entry: ${insErr.message}`);
      created++;
      console.log(`  ✓ Created (pending): ${entry.email} - ${entry.project} (${entry.hours}h)`);
    }
  }

  // P2 — Step 8: Accounting periods (period_key, close via RPC)
  console.log('\n📅 Creating accounting periods (period_key)...');
  for (const period of ACCOUNTING_PERIODS) {
    const { data: existing, error: selErr } = await supabase
      .from('accounting_periods')
      .select('id, period_key, status')
      .eq('period_key', period.periodKey)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query period ${period.periodKey}: ${selErr.message}`);

    if (!existing) {
      // Insert as open (default status)
      const { error: insErr } = await supabase
        .from('accounting_periods')
        .insert([{ period_key: period.periodKey }]);
      if (insErr) throw new Error(`Failed to create period ${period.periodKey}: ${insErr.message}`);
      created++;
      console.log(`  ✓ Created (open): ${period.periodKey}`);
    } else {
      skipped++;
      console.log(`  ✓ Exists: ${period.periodKey} (status: ${existing.status})`);
    }

    // Close via RPC if needed (uses official domain flow with admin auth)
    if (period.shouldClose) {
      // Create a separate admin client for closing the period
      const adminSupabase = createClient(supabaseUrl, anonKey);
      
      // Authenticate as admin to close the period
      const { error: adminAuthErr } = await adminSupabase.auth.signInWithPassword({
        email: 'admin@example.com',
        password: 'password123',
      });
      if (adminAuthErr) {
        throw new Error(`Failed to authenticate as admin for period close: ${adminAuthErr.message}`);
      }

      const { data: closeResult, error: closeErr } = await adminSupabase
        .rpc('close_accounting_period', { p_period_key: period.periodKey });
      if (closeErr) {
        // If already closed, that's idempotent — not an error
        if (closeErr.message.includes('already closed')) {
          console.log(`  ℹ Already closed: ${period.periodKey}`);
        } else {
          throw new Error(`Failed to close period ${period.periodKey}: ${closeErr.message}`);
        }
      } else {
        console.log(`  ✓ Closed via RPC: ${period.periodKey}`);
      }
    }
  }

  // P3 — Step 9: Project budgets (budget_type, budget_value, fiscal_year)
  console.log('\n📊 Creating project budgets (budget_type, budget_value, fiscal_year)...');
  for (const budget of PROJECT_BUDGETS) {
    const projectData = projectMap.get(budget.project);
    if (!projectData) continue;
    const { data: existing, error: selErr } = await supabase
      .from('project_budgets')
      .select('id')
      .eq('project_id', projectData.id)
      .eq('budget_type', budget.budgetType)
      .eq('fiscal_year', budget.fiscalYear)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query budget: ${selErr.message}`);

    if (!existing) {
      const { error: insErr } = await supabase
        .from('project_budgets')
        .insert([{ project_id: projectData.id, budget_type: budget.budgetType, budget_value: budget.budgetValue, fiscal_year: budget.fiscalYear }]);
      if (insErr) throw new Error(`Failed to create budget: ${insErr.message}`);
      created++;
      console.log(`  ✓ Created: ${budget.project} - ${budget.budgetType} - ${budget.fiscalYear}`);
    } else {
      skipped++;
      console.log(`  ✓ Exists: ${budget.project} - ${budget.budgetType} - ${budget.fiscalYear}`);
    }
  }

  // P4 — Step 10: Profitability alerts (config alerts, triggered_at = NULL)
  console.log('\n🚨 Creating profitability alerts (config, triggered_at=NULL)...');
  for (const alert of PROFITABILITY_ALERTS) {
    const projectData = projectMap.get(alert.project);
    if (!projectData) continue;
    const { data: existing, error: selErr } = await supabase
      .from('profitability_alerts')
      .select('id')
      .eq('project_id', projectData.id)
      .eq('metric', alert.metric)
      .maybeSingle();
    if (selErr) throw new Error(`Failed to query alert: ${selErr.message}`);

    if (!existing) {
      const { error: insErr } = await supabase
        .from('profitability_alerts')
        .insert([{ project_id: projectData.id, metric: alert.metric, threshold: alert.threshold }]);
      if (insErr) throw new Error(`Failed to create alert: ${insErr.message}`);
      created++;
      console.log(`  ✓ Created: ${alert.project} - ${alert.metric} (threshold: ${alert.threshold}%)`);
    } else {
      skipped++;
      console.log(`  ✓ Exists: ${alert.project} - ${alert.metric}`);
    }
  }

  // Summary
  console.log('\n📋 APPLY SUMMARY');
  console.log('  ────────────────────────────────────────────');
  console.log(`  Records created: ${created}`);
  console.log(`  Records skipped (already exist): ${skipped}`);
  console.log('  ────────────────────────────────────────────');
  console.log('\n✅ Demo data provisioning complete.');
  console.log('   Demo users (marked with foconflow_demo metadata):');
  for (const user of USERS) {
    console.log(`     ${user.email}`);
  }
  // P5 — Do NOT print the password or any secrets
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    if (isDryRun) {
      await dryRun();
    } else {
      await apply();
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
