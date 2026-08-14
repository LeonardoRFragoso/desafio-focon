export type UserRole = 'admin' | 'member';

export type ProjectStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export type TimeEntryStatus = 'pending' | 'approved' | 'rejected';

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
  created_at: string;
  updated_at: string;
}
