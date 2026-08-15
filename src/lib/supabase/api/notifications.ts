import { supabase } from '../client';

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
