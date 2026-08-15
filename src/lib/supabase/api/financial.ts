import { supabase } from '../client';
import type { AdminFilterValues } from '@/types/admin';

/**
 * Financial API
 */
export const financialAPI = {
  /**
   * Get project financials with optional filters
   */
  getProjectFinancials: async (filters?: { projectId?: string }) => {
    let query = supabase
      .from('project_financials')
      .select(
        'project_id, contracted_revenue, tax_rate, indirect_cost, created_at, updated_at, project:projects!project_financials_project_id_fkey(name)'
      );

    if (filters?.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    return query;
  },

  upsert: async (data: {
    project_id: string;
    contracted_revenue: number;
    tax_rate: number;
    indirect_cost: number;
  }) => {
    return supabase.from('project_financials').upsert([data]).select('*').single();
  },

  /**
   * Get approved time entries with optional filters
   */
  getApprovedTimeEntries: async (filters?: AdminFilterValues) => {
    let query = supabase
      .from('time_entries')
      .select(
        `
        id,
        project_id,
        professional_id,
        duration_minutes,
        applied_hourly_rate,
        approval_status,
        entry_date,
        project:projects!time_entries_project_id_fkey(name),
        professional:profiles!time_entries_professional_id_fkey(full_name)
      `
      )
      .eq('approval_status', 'approved');

    if (filters?.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters?.professionalId) {
      query = query.eq('professional_id', filters.professionalId);
    }
    if (filters?.startDate) {
      query = query.gte('entry_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('entry_date', filters.endDate);
    }

    return query;
  },

  /**
   * Get all projects
   */
  getProjects: async () => {
    return supabase
      .from('projects')
      .select('id, name, status')
      .eq('status', 'active')
      .order('name');
  },

  /**
   * Get all professionals (profiles)
   */
  getProfessionals: async () => {
    return supabase
      .from('profiles')
      .select('id, full_name, role')
      .order('full_name');
  },
};

/**
 * Audit logs API (admin)
 */
export const auditAPI = {
  list: async (limit = 100) => {
    return supabase
      .from('audit_logs')
      .select(
        'id, actor_id, action, entity_type, entity_id, before_data, after_data, metadata, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name)'
      )
      .order('created_at', { ascending: false })
      .limit(limit);
  },
};

/**
 * Accounting periods API (admin close/reopen)
 */
export const accountingPeriodsAPI = {
  list: async () => {
    return supabase
      .from('accounting_periods')
      .select(
        'id, period_key, status, closed_at, closed_by, created_at, updated_at, closed_by_profile:profiles!accounting_periods_closed_by_fkey(full_name)'
      )
      .order('period_key', { ascending: false });
  },
  close: async (periodKey: string) => {
    return supabase.rpc('close_accounting_period', { p_period_key: periodKey });
  },
  reopen: async (periodKey: string) => {
    return supabase.rpc('reopen_accounting_period', { p_period_key: periodKey });
  },
};
