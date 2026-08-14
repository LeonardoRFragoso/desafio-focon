import { supabase } from './client';
import type { TimeEntry } from '@/types/database';
import type { AdminFilterValues } from '@/types/admin';

/**
 * Time Entries API
 */
export const timeEntriesAPI = {
  /**
   * Get all pending time entries
   */
  getPending: async () => {
    return supabase
      .from('time_entries')
      .select(
        `
        id,
        professional_id,
        project_id,
        entry_date,
        duration_minutes,
        description,
        approval_status,
        applied_hourly_rate,
        professional:profiles!time_entries_professional_id_fkey(full_name),
        project:projects!time_entries_project_id_fkey(name)
      `
      )
      .eq('approval_status', 'pending')
      .order('entry_date', { ascending: false });
  },

  /**
   * Get time entries for a specific user
   */
  getByUser: async (userId: string) => {
    return supabase
      .from('time_entries')
      .select(
        `
        id,
        professional_id,
        project_id,
        entry_date,
        duration_minutes,
        description,
        approval_status,
        applied_hourly_rate,
        project:projects!time_entries_project_id_fkey(name)
      `
      )
      .eq('professional_id', userId)
      .order('entry_date', { ascending: false });
  },

  /**
   * Create a new time entry
   */
  create: async (entry: Omit<TimeEntry, 'id' | 'created_at' | 'updated_at'>) => {
    return supabase.from('time_entries').insert([entry]);
  },

  /**
   * Approve a time entry
   */
  approve: async (entryId: string) => {
    return supabase
      .from('time_entries')
      .update({ approval_status: 'approved' })
      .eq('id', entryId)
      .eq('approval_status', 'pending')
      .select('id, approval_status')
      .maybeSingle();
  },

  /**
   * Reject a time entry
   */
  reject: async (entryId: string) => {
    return supabase
      .from('time_entries')
      .update({ approval_status: 'rejected' })
      .eq('id', entryId)
      .eq('approval_status', 'pending')
      .select('id, approval_status')
      .maybeSingle();
  },

  /**
   * Delete a time entry (only if pending)
   */
  delete: async (entryId: string) => {
    return supabase
      .from('time_entries')
      .delete()
      .eq('id', entryId)
      .eq('approval_status', 'pending');
  },

  /**
   * Update a time entry (only if pending)
   */
  update: async (entryId: string, updates: Partial<TimeEntry>) => {
    return supabase
      .from('time_entries')
      .update(updates)
      .eq('id', entryId)
      .eq('approval_status', 'pending')
      .select('*')
      .maybeSingle();
  },
};

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
        'project_id, contracted_revenue, tax_rate, indirect_cost, project:projects!project_financials_project_id_fkey(name)'
      );

    if (filters?.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    return query;
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
