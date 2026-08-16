import { supabase } from '../client';
import type { TimeEntry } from '@/types/database';
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
   * Returns the created row (id) so callers can attach files to the new entry.
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
    return supabase
      .from('time_entries')
      .insert([
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
      ])
      .select('id')
      .maybeSingle();
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
      // Use or filter for text search on description.
      // The search term is sanitized to prevent PostgREST filter injection.
      // Only filter on direct columns — PostgREST does not support nested
      // resource columns (e.g. project.name) inside an `or` filter.
      query = query.or(buildIlikeOrFilter(search, ['description']));
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
      // Only filter on direct columns — PostgREST does not support nested
      // resource columns (e.g. professional.full_name) inside an `or` filter.
      query = query.or(
        buildIlikeOrFilter(search, ['description'])
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
