export type UserRole = 'admin' | 'member';

export type ProjectStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export type TimeEntryStatus = 'pending' | 'approved' | 'rejected';

export type AccountingPeriodStatus = 'open' | 'closed';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectFinancials {
  project_id: string;
  contracted_revenue: number;
  tax_rate: number;
  indirect_cost: number;
  created_at: string;
  updated_at: string;
}

export interface HourlyRate {
  id: string;
  professional_id: string;
  hourly_rate: number;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  project_id: string;
  professional_id: string;
  entry_date: string;
  duration_minutes: number;
  description: string;
  approval_status: TimeEntryStatus;
  applied_hourly_rate: number;
  rejection_reason?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  late_submission_reason?: string | null;
  created_at: string;
  updated_at: string;
  phase_id?: string | null;
  task_id?: string | null;
}

// Embedded relationship types (Supabase returns objects for one-to-one relationships)
export interface TimeEntryWithRelations extends TimeEntry {
  professional?: { full_name: string } | null;
  project?: { name: string } | null;
  phase?: { name: string } | null;
  task?: { title: string } | null;
  rejected_by_profile?: { full_name: string } | null;
}

export interface ProjectFinancialsWithRelations extends ProjectFinancials {
  project?: { name: string } | null;
}

export interface TimeEntryApprovalHistory {
  id: string;
  time_entry_id: string;
  previous_status: TimeEntryStatus;
  new_status: TimeEntryStatus;
  reason: string | null;
  changed_by: string;
  changed_by_profile?: { full_name: string } | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor?: { full_name: string } | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AccountingPeriod {
  id: string;
  period_key: string;
  status: AccountingPeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_profile?: { full_name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface BatchApprovalResult {
  entry_id: string;
  status: 'approved' | 'rejected' | 'failed';
  error: string | null;
}

export type NotificationType =
  | 'entry_approved'
  | 'entry_rejected'
  | 'entry_submitted'
  | 'entry_pending_reminder'
  | 'period_closing'
  | 'budget_threshold'
  | 'comment_received'
  | 'project_health_changed'
  | 'system';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface TimeEntryComment {
  id: string;
  time_entry_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author?: { full_name: string } | null;
}

export interface TimeEntryAttachment {
  id: string;
  time_entry_id: string;
  uploaded_by: string;
  file_name: string;
  file_size: number;
  content_type: string;
  storage_path: string;
  created_at: string;
  uploaded_by_profile?: { full_name: string } | null;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

export interface RecurringTimeEntryRule {
  id: string;
  professional_id: string;
  project_id: string;
  description: string;
  duration_minutes: number;
  frequency: RecurringFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  last_run_date: string | null;
  next_run_date: string;
  created_at: string;
  updated_at: string;
  project?: { name: string } | null;
}

export type BudgetType = 'labor_hours' | 'labor_cost' | 'total_cost';

export interface ProjectBudget {
  id: string;
  project_id: string;
  budget_type: BudgetType;
  budget_value: number;
  fiscal_year: number;
  created_at: string;
  updated_at: string;
  project?: { name: string } | null;
}

export type AlertMetric = 'margin_percent' | 'budget_utilization_percent';

export interface ProfitabilityAlert {
  id: string;
  project_id: string;
  threshold: number;
  metric: AlertMetric;
  triggered_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
  project?: { name: string } | null;
}

export interface UserPreference {
  user_id: string;
  pref_key: string;
  pref_value: unknown;
  updated_at: string;
}

// ============================================================================
// Project Workspace: phases, tasks, members
// ============================================================================

export type PhaseStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface ProjectPhase {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: PhaseStatus;
  position: number;
  planned_minutes: number | null;
  planned_cost: number | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ProjectTask {
  id: string;
  project_id: string;
  phase_id: string | null;
  milestone_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  planned_minutes: number | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignee?: { full_name: string } | null;
  phase?: { name: string } | null;
  milestone?: { name: string } | null;
}

export type ProjectRole = 'manager' | 'technical_lead' | 'professional' | 'observer';

export interface ProjectMember {
  id: string;
  project_id: string;
  professional_id: string;
  project_role: ProjectRole;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  professional?: { full_name: string; role: string } | null;
}

export interface ProjectWorkspaceSummary {
  total_phases: number;
  active_phases: number;
  completed_phases: number;
  total_tasks: number;
  open_tasks: number;
  done_tasks: number;
  overdue_tasks: number;
  team_size: number;
  planned_minutes: number;
  logged_minutes: number;
}

// ============================================================================
// Phase 4: Capacity Planning
// ============================================================================

export interface ProfessionalCapacityRule {
  id: string;
  professional_id: string;
  weekly_capacity_minutes: number;
  valid_from: string;
  valid_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  professional?: { full_name: string; role: string } | null;
}

export type AllocationType = 'planned' | 'confirmed' | 'tentative';

export interface ProjectAllocation {
  id: string;
  project_id: string;
  professional_id: string;
  start_date: string;
  end_date: string;
  allocated_minutes: number;
  allocation_type: AllocationType;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  project?: { name: string } | null;
  professional?: { full_name: string; role: string } | null;
}

export type CapacityStatus = 'available' | 'well_allocated' | 'overloaded' | 'no_capacity';

export interface CapacityProfessional {
  professional_id: string;
  full_name: string;
  role: string;
  capacity_minutes: number | null;
  allocated_minutes: number;
  actual_minutes: number;
  available_minutes: number | null;
  utilization_percent: number | null;
  status: CapacityStatus;
  projects: Array<{
    project_id: string;
    project_name: string;
    allocated_minutes: number;
    start_date: string;
    end_date: string;
    allocation_type: AllocationType;
  }>;
}

export interface CapacityOverview {
  period: { start_date: string; end_date: string };
  professionals: CapacityProfessional[];
  summary: {
    total_professionals: number;
    overloaded_count: number;
    well_allocated_count: number;
    available_count: number;
    no_capacity_count: number;
  };
}

export interface MyAllocations {
  period: { start_date: string; end_date: string };
  capacity_minutes: number | null;
  allocated_minutes: number;
  actual_minutes: number;
  available_minutes: number | null;
  utilization_percent: number | null;
  status: CapacityStatus;
  allocations: Array<{
    id: string;
    project_id: string;
    project_name: string;
    start_date: string;
    end_date: string;
    allocated_minutes: number;
    allocation_type: AllocationType;
    notes: string | null;
  }>;
}

// ============================================================================
// Phase 6: Milestones, Project Health & Forecasting
// ============================================================================

export type MilestoneStatus = 'planned' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type MilestonePriority = 'low' | 'medium' | 'high' | 'critical';

export interface ProjectMilestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  priority: MilestonePriority;
  owner_id: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress_percent: number;
  weight: number;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: { full_name: string } | null;
  task_count?: number;
  completed_task_count?: number;
}

export type HealthStatus = 'healthy' | 'attention' | 'at_risk' | 'not_applicable';

export interface HealthDrivers {
  schedule?: {
    overdue_end_penalty: number;
    overdue_milestones: number;
    milestone_penalty: number;
    overdue_tasks: number;
    task_penalty: number;
    penalty: number;
  };
  budget?: {
    has_budget: boolean;
    utilization: number | null;
    penalty: number;
  };
  profitability?: {
    active_alerts: number;
    penalty: number;
  };
  capacity?: {
    available: boolean;
    overallocated_members: number;
    max_utilization: number;
    penalty: number;
  };
  critical_delivery?: {
    critical_milestones_blocked: number;
    critical_milestones_overdue: number;
    critical_milestones_due_soon: number;
    critical_tasks_blocked: number;
    critical_tasks_overdue: number;
    critical_tasks_due_soon: number;
    penalty: number;
  };
  hard_override?: string | null;
  reason?: string;
}

export interface ProjectHealthState {
  score: number | null;
  status: HealthStatus | null;
  progress: number | null;
  budget_utilization: number | null;
  forecast_completion_date: string | null;
  forecast_labor_cost: number | null;
  drivers: HealthDrivers | null;
  calculated_at: string | null;
}

export interface ProjectHealthEvent {
  id: string;
  project_id: string;
  previous_status: HealthStatus | null;
  new_status: HealthStatus;
  previous_score: number | null;
  new_score: number;
  drivers: HealthDrivers | null;
  created_at: string;
}

export interface ProjectHealthSummaryItem {
  id: string;
  name: string;
  client: string;
  project_status: string;
  start_date: string;
  end_date: string;
  health_score: number | null;
  health_status: HealthStatus;
  progress_percent: number | null;
  budget_utilization: number | null;
  forecast_completion_date: string | null;
  forecast_labor_cost: number | null;
  calculated_at: string | null;
  overdue_milestones_count: number;
  overdue_tasks_count: number;
  total_milestones: number;
}
