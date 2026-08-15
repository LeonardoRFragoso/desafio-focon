import { supabase } from '../client';

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
