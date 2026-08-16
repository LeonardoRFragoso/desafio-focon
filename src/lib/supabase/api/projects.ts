import { supabase } from '../client';

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
