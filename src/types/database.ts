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
  created_at: string;
  updated_at: string;
}

// Embedded relationship types (Supabase returns objects for one-to-one relationships)
export interface TimeEntryWithRelations extends TimeEntry {
  professional?: { full_name: string } | null;
  project?: { name: string } | null;
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
