import { supabase } from './client';
import type { TimeEntry } from '@/types/database';
import type { AdminFilterValues } from '@/types/admin';
import { buildIlikeOrFilter } from '@/lib/postgrestFilter';

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
    phase_id?: string | null;
    task_id?: string | null;
    late_submission_reason?: string | null;
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
        phase_id: entry.phase_id || null,
        task_id: entry.task_id || null,
        late_submission_reason: entry.late_submission_reason || null,
      },
    ]);
  },

  /**
   * Duplicate a time entry as a new pending entry. Copies project, duration and
   * description; the new date is configurable. Never copies id/status/history.
   * The DB trigger sets the applied_hourly_rate for the new date.
   * Does NOT copy late_submission_reason — the new date determines if a reason is needed.
   */
  duplicate: async (source: {
    project_id: string;
    professional_id: string;
    duration_minutes: number;
    description: string;
    entry_date: string;
    late_submission_reason?: string | null;
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
        late_submission_reason: source.late_submission_reason || null,
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
    updates: Pick<TimeEntry, 'project_id' | 'entry_date' | 'duration_minutes' | 'description'> & {
      late_submission_reason?: string | null;
    }
  ) => {
    return supabase
      .from('time_entries')
      .update({
        project_id: updates.project_id,
        entry_date: updates.entry_date,
        duration_minutes: updates.duration_minutes,
        description: updates.description,
        late_submission_reason: updates.late_submission_reason ?? null,
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

  /**
   * Server-side paginated query for a user's own time entries.
   * Supports text search, project/phase/task/status filters, and date range.
   * Returns { data, count } where count is the total matching records.
   */
  queryUserEntries: async (params: {
    userId: string;
    search?: string;
    projectId?: string;
    phaseId?: string;
    taskId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    pageSize: number;
  }) => {
    const {
      userId,
      search,
      projectId,
      phaseId,
      taskId,
      status,
      startDate,
      endDate,
      page,
      pageSize,
    } = params;

    const selectCols = `
      id, project_id, professional_id, entry_date, duration_minutes,
      description, approval_status, applied_hourly_rate,
      rejection_reason, rejected_by, rejected_at, late_submission_reason,
      created_at, updated_at, phase_id, task_id,
      project:projects!time_entries_project_id_fkey(name),
      phase:project_phases!time_entries_phase_id_fkey(name),
      task:project_tasks!time_entries_task_id_fkey(title),
      rejected_by_profile:profiles!time_entries_rejected_by_fkey(full_name)
    `;

    let query = supabase.from('time_entries').select(selectCols, { count: 'exact' });
    query = query.eq('professional_id', userId);

    if (projectId) query = query.eq('project_id', projectId);
    if (phaseId) query = query.eq('phase_id', phaseId);
    if (taskId) query = query.eq('task_id', taskId);
    if (status) query = query.eq('approval_status', status);
    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);

    if (search) {
      // Use or filter for text search on description and project name.
      // The search term is sanitized to prevent PostgREST filter injection.
      query = query.or(buildIlikeOrFilter(search, ['description', 'project.name']));
    }

    query = query
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    return query;
  },

  /**
   * Server-side paginated query for ALL time entries (admin only).
   * Supports text search, professional/project/phase/task/status filters, date range.
   * Returns { data, count } where count is the total matching records.
   */
  queryAllEntries: async (params: {
    search?: string;
    professionalId?: string;
    projectId?: string;
    phaseId?: string;
    taskId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    pageSize: number;
  }) => {
    const {
      search,
      professionalId,
      projectId,
      phaseId,
      taskId,
      status,
      startDate,
      endDate,
      page,
      pageSize,
    } = params;

    const selectCols = `
      id, project_id, professional_id, entry_date, duration_minutes,
      description, approval_status, applied_hourly_rate,
      rejection_reason, rejected_by, rejected_at, late_submission_reason,
      created_at, updated_at, phase_id, task_id,
      project:projects!time_entries_project_id_fkey(name),
      professional:profiles!time_entries_professional_id_fkey(full_name),
      phase:project_phases!time_entries_phase_id_fkey(name),
      task:project_tasks!time_entries_task_id_fkey(title),
      rejected_by_profile:profiles!time_entries_rejected_by_fkey(full_name)
    `;

    let query = supabase.from('time_entries').select(selectCols, { count: 'exact' });

    if (professionalId) query = query.eq('professional_id', professionalId);
    if (projectId) query = query.eq('project_id', projectId);
    if (phaseId) query = query.eq('phase_id', phaseId);
    if (taskId) query = query.eq('task_id', taskId);
    if (status) query = query.eq('approval_status', status);
    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);

    if (search) {
      // The search term is sanitized to prevent PostgREST filter injection.
      query = query.or(
        buildIlikeOrFilter(search, ['description', 'professional.full_name', 'project.name'])
      );
    }

    query = query
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    return query;
  },

  /**
   * Get a single time entry by ID with all relations (for deep-link modal).
   */
  getById: async (entryId: string) => {
    const selectCols = `
      id, project_id, professional_id, entry_date, duration_minutes,
      description, approval_status, applied_hourly_rate,
      rejection_reason, rejected_by, rejected_at,
      created_at, updated_at, phase_id, task_id,
      project:projects!time_entries_project_id_fkey(name),
      professional:profiles!time_entries_professional_id_fkey(full_name),
      phase:project_phases!time_entries_phase_id_fkey(name),
      task:project_tasks!time_entries_task_id_fkey(title),
      rejected_by_profile:profiles!time_entries_rejected_by_fkey(full_name)
    `;
    return supabase.from('time_entries').select(selectCols).eq('id', entryId).maybeSingle();
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
  /**
   * List projects with team member count (for unassigned-team filter).
   * Returns projects with an embedded `member_count` field.
   */
  listWithTeamInfo: async () => {
    return supabase
      .from('projects')
      .select(
        `
        id, name, client, status, start_date, end_date, created_at, updated_at,
        project_members(count)
        `
      )
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
  remove: async (userId: string, key: string) => {
    return supabase
      .from('user_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('pref_key', key);
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

/**
 * Project Phases API
 */
export const projectPhasesAPI = {
  listByProject: async (projectId: string) => {
    return supabase
      .from('project_phases')
      .select(
        'id, project_id, name, description, status, position, planned_minutes, planned_cost, start_date, due_date, completed_at, created_by, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .order('position', { ascending: true });
  },
  create: async (data: {
    project_id: string;
    name: string;
    description?: string | null;
    status?: string;
    position?: number;
    planned_minutes?: number | null;
    planned_cost?: number | null;
    start_date?: string | null;
    due_date?: string | null;
  }) => {
    return supabase.from('project_phases').insert([data]).select('*').single();
  },
  update: async (
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      status: string;
      position: number;
      planned_minutes: number | null;
      planned_cost: number | null;
      start_date: string | null;
      due_date: string | null;
      completed_at: string | null;
    }>
  ) => {
    return supabase.from('project_phases').update(data).eq('id', id).select('*').single();
  },
  remove: async (id: string) => {
    return supabase.from('project_phases').delete().eq('id', id);
  },
};

/**
 * Project Tasks API
 */
export const projectTasksAPI = {
  listByProject: async (projectId: string) => {
    return supabase
      .from('project_tasks')
      .select(
        `
        id, project_id, phase_id, milestone_id, title, description, status, priority,
        assignee_id, planned_minutes, start_date, due_date, completed_at,
        created_by, created_at, updated_at,
        assignee:profiles!project_tasks_assignee_id_fkey(full_name),
        phase:project_phases!project_tasks_phase_id_fkey(name),
        milestone:project_milestones!project_tasks_milestone_id_fkey(name)
        `
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
  },
  create: async (data: {
    project_id: string;
    phase_id?: string | null;
    milestone_id?: string | null;
    title: string;
    description?: string | null;
    status?: string;
    priority?: string;
    assignee_id?: string | null;
    planned_minutes?: number | null;
    start_date?: string | null;
    due_date?: string | null;
  }) => {
    return supabase.from('project_tasks').insert([data]).select('*').single();
  },
  update: async (
    id: string,
    data: Partial<{
      phase_id: string | null;
      milestone_id: string | null;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      assignee_id: string | null;
      planned_minutes: number | null;
      start_date: string | null;
      due_date: string | null;
      completed_at: string | null;
    }>
  ) => {
    return supabase.from('project_tasks').update(data).eq('id', id).select('*').single();
  },
  remove: async (id: string) => {
    return supabase.from('project_tasks').delete().eq('id', id);
  },
};

/**
 * Project Members API
 */
export const projectMembersAPI = {
  listByProject: async (projectId: string) => {
    return supabase
      .from('project_members')
      .select(
        `
        id, project_id, professional_id, project_role, created_by, created_at, updated_at,
        professional:profiles!project_members_professional_id_fkey(full_name, role)
        `
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
  },
  create: async (data: {
    project_id: string;
    professional_id: string;
    project_role?: string;
  }) => {
    return supabase.from('project_members').insert([data]).select('*').single();
  },
  update: async (id: string, data: { project_role: string }) => {
    return supabase.from('project_members').update(data).eq('id', id).select('*').single();
  },
  remove: async (id: string) => {
    return supabase.from('project_members').delete().eq('id', id);
  },
};

/**
 * Project Workspace Summary API (admin RPC)
 */
export const projectWorkspaceAPI = {
  getSummary: async (projectId: string) => {
    return supabase.rpc('get_project_workspace_summary', { p_project_id: projectId });
  },
};

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

export interface ProjectAttentionItem {
  id: string;
  name: string;
  client: string;
  status: string;
  approved_minutes: number;
  budget_value: number;
  budget_utilization_percent: number;
  overdue_tasks_count: number;
  active_alerts_count: number;
  team_size: number;
  attention_state: 'critical' | 'warning' | 'normal';
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

  getProjectsAttention: async () => {
    return supabase.rpc('get_projects_attention_summary');
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
// Phase 6: Project Milestones API
// ===========================================================================

export const projectMilestonesAPI = {
  listByProject: async (projectId: string) => {
    return supabase
      .from('project_milestones')
      .select(
        `
        id, project_id, name, description, status, priority, owner_id,
        start_date, due_date, completed_at, progress_percent, weight, position,
        created_by, created_at, updated_at,
        owner:profiles!project_milestones_owner_id_fkey(full_name)
        `
      )
      .eq('project_id', projectId)
      .order('position', { ascending: true });
  },

  getById: async (milestoneId: string) => {
    return supabase
      .from('project_milestones')
      .select(
        `
        id, project_id, name, description, status, priority, owner_id,
        start_date, due_date, completed_at, progress_percent, weight, position,
        created_by, created_at, updated_at,
        owner:profiles!project_milestones_owner_id_fkey(full_name)
        `
      )
      .eq('id', milestoneId)
      .maybeSingle();
  },

  create: async (data: {
    project_id: string;
    name: string;
    description?: string | null;
    status?: string;
    priority?: string;
    owner_id?: string | null;
    start_date?: string | null;
    due_date?: string | null;
    progress_percent?: number;
    weight?: number;
    position?: number;
  }) => {
    return supabase.from('project_milestones').insert([data]).select('*').single();
  },

  update: async (
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      status: string;
      priority: string;
      owner_id: string | null;
      start_date: string | null;
      due_date: string | null;
      completed_at: string | null;
      progress_percent: number;
      weight: number;
      position: number;
    }>
  ) => {
    return supabase.from('project_milestones').update(data).eq('id', id).select('*').single();
  },

  remove: async (id: string) => {
    return supabase.from('project_milestones').delete().eq('id', id);
  },

  /** Get tasks linked to a milestone */
  getTasks: async (milestoneId: string) => {
    return supabase
      .from('project_tasks')
      .select(
        `
        id, project_id, phase_id, milestone_id, title, description, status, priority,
        assignee_id, planned_minutes, start_date, due_date, completed_at,
        created_by, created_at, updated_at,
        assignee:profiles!project_tasks_assignee_id_fkey(full_name),
        phase:project_phases!project_tasks_phase_id_fkey(name)
        `
      )
      .eq('milestone_id', milestoneId)
      .order('created_at', { ascending: false });
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

