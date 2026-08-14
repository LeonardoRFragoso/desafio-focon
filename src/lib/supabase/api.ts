import { supabase } from './client';
import type { TimeEntry } from '@/types/database';
import type { AdminFilterValues } from '@/types/admin';

/**
 * Time Entries API
 */
export const timeEntriesAPI = {
  /**
   * Get all pending time entries (admin view, includes rejection metadata)
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
        rejection_reason,
        rejected_by,
        rejected_at,
        professional:profiles!time_entries_professional_id_fkey(full_name),
        project:projects!time_entries_project_id_fkey(name)
      `
      )
      .eq('approval_status', 'pending')
      .order('entry_date', { ascending: false });
  },

  /**
   * Get time entries for a specific user (includes rejection metadata)
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
        rejection_reason,
        rejected_by,
        rejected_at,
        rejected_by_profile:profiles!time_entries_rejected_by_fkey(full_name),
        project:projects!time_entries_project_id_fkey(name)
      `
      )
      .eq('professional_id', userId)
      .order('entry_date', { ascending: false });
  },

  /**
   * Create a new time entry. applied_hourly_rate is set by a DB trigger.
   */
  create: async (entry: {
    project_id: string;
    professional_id: string;
    entry_date: string;
    duration_minutes: number;
    description: string;
    approval_status?: string;
    applied_hourly_rate?: number;
  }) => {
    return supabase.from('time_entries').insert([
      {
        project_id: entry.project_id,
        professional_id: entry.professional_id,
        entry_date: entry.entry_date,
        duration_minutes: entry.duration_minutes,
        description: entry.description,
        approval_status: 'pending',
        applied_hourly_rate: 0, // trigger overwrites with the real rate
      },
    ]);
  },

  /**
   * Duplicate a time entry as a new pending entry. Copies project, duration and
   * description; the new date is configurable. Never copies id/status/history.
   * The DB trigger sets the applied_hourly_rate for the new date.
   */
  duplicate: async (source: {
    project_id: string;
    professional_id: string;
    duration_minutes: number;
    description: string;
    entry_date: string;
  }) => {
    return supabase.from('time_entries').insert([
      {
        project_id: source.project_id,
        professional_id: source.professional_id,
        entry_date: source.entry_date,
        duration_minutes: source.duration_minutes,
        description: source.description,
        approval_status: 'pending',
        applied_hourly_rate: 0, // trigger overwrites
      },
    ]);
  },

  /**
   * Approve a time entry via admin RPC (records history + audit).
   */
  approve: async (entryId: string) => {
    return supabase.rpc('approve_time_entry', { p_entry_id: entryId });
  },

  /**
   * Reject a time entry via admin RPC (reason required; records history + audit).
   */
  reject: async (entryId: string, reason: string) => {
    return supabase.rpc('reject_time_entry', {
      p_entry_id: entryId,
      p_reason: reason,
    });
  },

  /**
   * Batch approve via admin RPC (transactional, partial feedback).
   */
  batchApprove: async (entryIds: string[]) => {
    return supabase.rpc('batch_approve_time_entries', {
      p_entry_ids: entryIds,
    });
  },

  /**
   * Batch reject via admin RPC (reason required; transactional, partial feedback).
   */
  batchReject: async (entryIds: string[], reason: string) => {
    return supabase.rpc('batch_reject_time_entries', {
      p_entry_ids: entryIds,
      p_reason: reason,
    });
  },

  /**
   * Delete a time entry (RLS allows only own pending entries).
   */
  delete: async (entryId: string) => {
    return supabase.from('time_entries').delete().eq('id', entryId);
  },

  /**
   * Update a pending time entry (RLS allows only own pending entries).
   * Only project/date/duration/description are editable; professional_id and
   * applied_hourly_rate are controlled by the database.
   */
  update: async (
    entryId: string,
    updates: Pick<TimeEntry, 'project_id' | 'entry_date' | 'duration_minutes' | 'description'>
  ) => {
    return supabase
      .from('time_entries')
      .update({
        project_id: updates.project_id,
        entry_date: updates.entry_date,
        duration_minutes: updates.duration_minutes,
        description: updates.description,
      })
      .eq('id', entryId)
      .select('*')
      .maybeSingle();
  },

  /**
   * Get approval history for a time entry (RLS: own entries or admin).
   */
  getHistory: async (entryId: string) => {
    return supabase
      .from('time_entry_approval_history')
      .select(
        `
        id,
        time_entry_id,
        previous_status,
        new_status,
        reason,
        changed_by,
        created_at,
        changed_by_profile:profiles!time_entry_approval_history_changed_by_fkey(full_name)
      `
      )
      .eq('time_entry_id', entryId)
      .order('created_at', { ascending: true });
  },
};

/**
 * Projects API (admin CRUD)
 */
export const projectsAPI = {
  list: async () => {
    return supabase
      .from('projects')
      .select('id, name, client, status, start_date, end_date, created_at, updated_at')
      .order('name');
  },
  listActive: async () => {
    return supabase
      .from('projects')
      .select('id, name')
      .in('status', ['active', 'planned'])
      .order('name');
  },
  create: async (data: {
    name: string;
    client: string;
    status: string;
    start_date: string;
    end_date: string;
  }) => {
    return supabase.from('projects').insert([data]).select('*').single();
  },
  update: async (
    id: string,
    data: Partial<{
      name: string;
      client: string;
      status: string;
      start_date: string;
      end_date: string;
    }>
  ) => {
    return supabase.from('projects').update(data).eq('id', id).select('*').single();
  },
  remove: async (id: string) => {
    return supabase.from('projects').delete().eq('id', id);
  },
};

/**
 * Hourly rates API (admin)
 */
export const hourlyRatesAPI = {
  list: async () => {
    return supabase
      .from('hourly_rates')
      .select(
        'id, professional_id, hourly_rate, valid_from, valid_until, created_at, updated_at, professional:profiles!hourly_rates_professional_id_fkey(full_name)'
      )
      .order('valid_from', { ascending: false });
  },
  listForProfessional: async (professionalId: string) => {
    return supabase
      .from('hourly_rates')
      .select('id, hourly_rate, valid_from, valid_until, created_at, updated_at')
      .eq('professional_id', professionalId)
      .order('valid_from', { ascending: false });
  },
  create: async (data: {
    professional_id: string;
    hourly_rate: number;
    valid_from: string;
    valid_until: string | null;
  }) => {
    return supabase.from('hourly_rates').insert([data]).select('*').single();
  },
  closeCurrent: async (id: string, validUntil: string) => {
    return supabase
      .from('hourly_rates')
      .update({ valid_until: validUntil })
      .eq('id', id)
      .is('valid_until', null)
      .select('*')
      .maybeSingle();
  },
};

/**
 * Profiles / Professionals API (admin)
 */
export const profilesAPI = {
  list: async () => {
    return supabase
      .from('profiles')
      .select('id, full_name, role, created_at, updated_at')
      .order('full_name');
  },
  updateRole: async (id: string, role: 'admin' | 'member') => {
    return supabase.from('profiles').update({ role }).eq('id', id).select('*').single();
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

/**
 * Notifications API
 */
export const notificationsAPI = {
  list: async (unreadOnly = false) => {
    let query = supabase
      .from('notifications')
      .select('id, user_id, type, title, body, entity_type, entity_id, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (unreadOnly) query = query.is('read_at', null);
    return query;
  },
  markRead: async (id: string) => {
    return supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
  },
  markAllRead: async (userId: string) => {
    return supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
  },
  remove: async (id: string) => {
    return supabase.from('notifications').delete().eq('id', id);
  },
  subscribeToUnread: (userId: string, callback: (count: number) => void) => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          notificationsAPI.list(true).then(({ data }) => {
            callback((data as unknown[] | null)?.length ?? 0);
          });
        }
      )
      .subscribe();
    return channel;
  },
};

/**
 * Comments API (on time entries)
 */
export const commentsAPI = {
  list: async (entryId: string) => {
    return supabase
      .from('time_entry_comments')
      .select(
        'id, time_entry_id, author_id, body, created_at, updated_at, author:profiles!time_entry_comments_author_id_fkey(full_name)'
      )
      .eq('time_entry_id', entryId)
      .order('created_at', { ascending: true });
  },
  create: async (entryId: string, authorId: string, body: string) => {
    return supabase
      .from('time_entry_comments')
      .insert([{ time_entry_id: entryId, author_id: authorId, body }])
      .select('*')
      .single();
  },
  remove: async (id: string) => {
    return supabase.from('time_entry_comments').delete().eq('id', id);
  },
  subscribe: (entryId: string, callback: () => void) => {
    const channel = supabase
      .channel(`comments:${entryId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entry_comments',
          filter: `time_entry_id=eq.${entryId}`,
        },
        () => callback()
      )
      .subscribe();
    return channel;
  },
};

/**
 * Recurring rules API (own CRUD)
 */
export const recurringRulesAPI = {
  list: async () => {
    return supabase
      .from('recurring_time_entry_rules')
      .select(
        'id, professional_id, project_id, description, duration_minutes, frequency, day_of_week, day_of_month, start_date, end_date, is_active, last_run_date, next_run_date, created_at, updated_at, project:projects!recurring_time_entry_rules_project_id_fkey(name)'
      )
      .order('created_at', { ascending: false });
  },
  create: async (data: {
    professional_id: string;
    project_id: string;
    description: string;
    duration_minutes: number;
    frequency: 'daily' | 'weekly' | 'monthly';
    day_of_week?: number | null;
    day_of_month?: number | null;
    start_date: string;
    end_date?: string | null;
    next_run_date: string;
  }) => {
    return supabase.from('recurring_time_entry_rules').insert([data]).select('*').single();
  },
  update: async (
    id: string,
    data: Partial<{
      description: string;
      duration_minutes: number;
      is_active: boolean;
      end_date: string | null;
    }>
  ) => {
    return supabase.from('recurring_time_entry_rules').update(data).eq('id', id).select('*').single();
  },
  remove: async (id: string) => {
    return supabase.from('recurring_time_entry_rules').delete().eq('id', id);
  },
};

/**
 * User preferences API (own key-value store)
 */
export const userPreferencesAPI = {
  get: async (userId: string, key: string) => {
    return supabase
      .from('user_preferences')
      .select('pref_value')
      .eq('user_id', userId)
      .eq('pref_key', key)
      .maybeSingle();
  },
  set: async (userId: string, key: string, value: unknown) => {
    return supabase
      .from('user_preferences')
      .upsert([{ user_id: userId, pref_key: key, pref_value: value as never }])
      .select('*')
      .single();
  },
};

/**
 * Project budgets API (admin CRUD, all read)
 */
export const projectBudgetsAPI = {
  list: async () => {
    return supabase
      .from('project_budgets')
      .select(
        'id, project_id, budget_type, budget_value, fiscal_year, created_at, updated_at, project:projects!project_budgets_project_id_fkey(name)'
      )
      .order('fiscal_year', { ascending: false });
  },
  create: async (data: {
    project_id: string;
    budget_type: string;
    budget_value: number;
    fiscal_year: number;
  }) => {
    return supabase.from('project_budgets').insert([data]).select('*').single();
  },
  remove: async (id: string) => {
    return supabase.from('project_budgets').delete().eq('id', id);
  },
};
