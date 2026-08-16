import { supabase } from '../client';

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
