import { supabase } from '../client';

// ===========================================================================
// Executive Command Center API
// ===========================================================================

export interface AdminCommandCenterSummary {
  period: { start_date: string; end_date: string };
  action_signals: {
    pending_count: number;
    old_pending_count: number;
    old_pending_threshold_days: number;
    rejected_recent_count: number;
    overbudget_projects: Array<{
      project_id: string;
      project_name: string;
      client: string;
      budget_value: number;
      realized_cost: number;
      utilization_percent: number;
    }>;
    unack_alerts_count: number;
    overdue_tasks_count: number;
    critical_tasks_count: number;
    missing_rate_count: number;
    projects_without_team_count: number;
  };
  kpis: {
    total_revenue: number;
    total_tax: number;
    total_indirect_cost: number;
    total_labor_cost: number;
    total_result: number;
    total_margin: number;
    approved_hours_period: number;
    active_projects: number;
    pending_approvals: number;
    open_tasks: number;
    overdue_tasks: number;
  };
  team_summary: Array<{
    professional_id: string;
    full_name: string;
    approved_hours: number;
    entry_count: number;
  }>;
  pending_approvals: Array<{
    id: string;
    professional_name: string;
    project_name: string;
    entry_date: string;
    duration_minutes: number;
    description: string;
    created_at: string;
  }>;
}

export interface ProfessionalDashboardStats {
  stats: {
    pending_count: number;
    approved_count: number;
    rejected_count: number;
    approved_minutes: number;
  };
  rejected_entries: Array<{
    id: string;
    project_name: string;
    entry_date: string;
    duration_minutes: number;
    rejection_reason: string | null;
    rejected_at: string | null;
  }>;
  my_tasks: Array<{
    id: string;
    project_id: string;
    project_name: string;
    phase_name: string | null;
    title: string;
    priority: string;
    status: string;
    due_date: string | null;
  }>;
  task_counts: {
    overdue: number;
    critical: number;
    due_soon: number;
  };
  unread_notifications: number;
  weekly_goal: {
    configured: boolean;
    goal_minutes: number | null;
    approved_minutes: number;
    pending_minutes: number;
    rejected_minutes: number;
    registered_minutes: number;
    remaining_minutes: number | null;
    progress_percent: number | null;
    week_start: string;
    week_end: string;
  };
}

export interface SearchResult {
  type: 'project' | 'task' | 'milestone' | 'professional' | 'time_entry';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface GlobalSearchResults {
  projects: SearchResult[];
  tasks: SearchResult[];
  milestones: SearchResult[];
  professionals: SearchResult[];
  time_entries: SearchResult[];
}

/**
 * Executive Command Center API (admin RPCs)
 */
export const commandCenterAPI = {
  getAdminSummary: async (startDate?: string, endDate?: string) => {
    const params: { p_start_date?: string; p_end_date?: string } = {};
    if (startDate) params.p_start_date = startDate;
    if (endDate) params.p_end_date = endDate;
    return supabase.rpc('get_admin_command_center_summary', params);
  },

  getProfessionalStats: async (userId?: string) => {
    const params: { p_user_id?: string } = {};
    if (userId) params.p_user_id = userId;
    return supabase.rpc('get_professional_dashboard_stats', params);
  },

  searchGlobal: async (query: string, limit?: number) => {
    const params: { p_query: string; p_limit?: number } = { p_query: query };
    if (limit) params.p_limit = limit;
    return supabase.rpc('search_global', params);
  },
};

/**
 * Capacity Planning API (Phase 4)
 */
export const capacityAPI = {
  /** Get aggregated capacity overview for all professionals (admin only). */
  getOverview: async (startDate?: string, endDate?: string) => {
    const params: { p_start_date?: string; p_end_date?: string } = {};
    if (startDate) params.p_start_date = startDate;
    if (endDate) params.p_end_date = endDate;
    return supabase.rpc('get_capacity_overview', params);
  },

  /** Get the current user's own allocations + capacity (member). */
  getMyAllocations: async (startDate?: string, endDate?: string) => {
    const params: { p_start_date?: string; p_end_date?: string } = {};
    if (startDate) params.p_start_date = startDate;
    if (endDate) params.p_end_date = endDate;
    return supabase.rpc('get_my_allocations', params);
  },

  /** List all capacity rules (admin sees all, member sees own). */
  listCapacityRules: async () => {
    return supabase
      .from('professional_capacity_rules')
      .select(
        `
        id, professional_id, weekly_capacity_minutes, valid_from, valid_until,
        created_by, created_at, updated_at,
        professional:profiles!professional_capacity_rules_professional_id_fkey(full_name, role)
      `
      )
      .order('valid_from', { ascending: false });
  },

  /** Create a capacity rule (admin only). */
  createCapacityRule: async (data: {
    professional_id: string;
    weekly_capacity_minutes: number;
    valid_from: string;
    valid_until?: string | null;
  }) => {
    return supabase.from('professional_capacity_rules').insert([
      {
        professional_id: data.professional_id,
        weekly_capacity_minutes: data.weekly_capacity_minutes,
        valid_from: data.valid_from,
        valid_until: data.valid_until ?? null,
      },
    ]);
  },

  /** Update a capacity rule (admin only). */
  updateCapacityRule: async (
    id: string,
    data: {
      weekly_capacity_minutes?: number;
      valid_from?: string;
      valid_until?: string | null;
    }
  ) => {
    return supabase
      .from('professional_capacity_rules')
      .update(data)
      .eq('id', id);
  },

  /** Delete a capacity rule (admin only). */
  deleteCapacityRule: async (id: string) => {
    return supabase.from('professional_capacity_rules').delete().eq('id', id);
  },

  /** List all allocations (admin sees all, member sees own). */
  listAllocations: async () => {
    return supabase
      .from('project_allocations')
      .select(
        `
        id, project_id, professional_id, start_date, end_date,
        allocated_minutes, allocation_type, notes, created_by, created_at, updated_at,
        project:projects!project_allocations_project_id_fkey(name),
        professional:profiles!project_allocations_professional_id_fkey(full_name, role)
      `
      )
      .order('start_date', { ascending: false });
  },

  /** Create an allocation (admin only). */
  createAllocation: async (data: {
    project_id: string;
    professional_id: string;
    start_date: string;
    end_date: string;
    allocated_minutes: number;
    allocation_type?: string;
    notes?: string | null;
  }) => {
    return supabase.from('project_allocations').insert([
      {
        project_id: data.project_id,
        professional_id: data.professional_id,
        start_date: data.start_date,
        end_date: data.end_date,
        allocated_minutes: data.allocated_minutes,
        allocation_type: data.allocation_type ?? 'planned',
        notes: data.notes ?? null,
      },
    ]);
  },

  /** Update an allocation (admin only). */
  updateAllocation: async (
    id: string,
    data: {
      project_id?: string;
      professional_id?: string;
      start_date?: string;
      end_date?: string;
      allocated_minutes?: number;
      allocation_type?: string;
      notes?: string | null;
    }
  ) => {
    return supabase.from('project_allocations').update(data).eq('id', id);
  },

  /** Delete an allocation (admin only). */
  deleteAllocation: async (id: string) => {
    return supabase.from('project_allocations').delete().eq('id', id);
  },
};

// ===========================================================================
// Phase 6: Project Health API
// ===========================================================================

export const projectHealthAPI = {
  /** Get canonical project progress (weighted milestone or task fallback). */
  getProgress: async (projectId: string) => {
    return supabase.rpc('get_project_progress', { p_project_id: projectId });
  },

  /** Calculate health without persisting (admin only). */
  calculate: async (projectId: string) => {
    return supabase.rpc('calculate_project_health', { p_project_id: projectId });
  },

  /** Recalculate and persist health state + emit events/notifications (admin only). */
  recalculate: async (projectId: string) => {
    return supabase.rpc('recalculate_project_health', { p_project_id: projectId });
  },

  /** Recalculate health for all projects (admin only). */
  recalculateAll: async () => {
    return supabase.rpc('recalculate_all_project_health');
  },

  /** Get current health state (admin: full, member: sanitized). */
  get: async (projectId: string) => {
    return supabase.rpc('get_project_health', { p_project_id: projectId });
  },

  /** Get health summary for all active/planned projects (admin only). */
  getSummary: async (statusFilter?: string) => {
    const params: { p_status_filter?: string } = {};
    if (statusFilter) params.p_status_filter = statusFilter;
    return supabase.rpc('get_projects_health_summary', params);
  },

  /** Get health transition history (admin: full, member: sanitized). */
  getHistory: async (projectId: string) => {
    return supabase.rpc('get_project_health_history', { p_project_id: projectId });
  },
};
