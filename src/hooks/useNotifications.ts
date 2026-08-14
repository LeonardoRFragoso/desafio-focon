import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsAPI } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';
import type { Notification } from '@/types/database';

export function useNotifications() {
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const channelRef = useRef<ReturnType<typeof notificationsAPI.subscribeToUnread> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data } = await notificationsAPI.list(false);
      setNotifications((data as Notification[]) || []);
      const { data: unread } = await notificationsAPI.list(true);
      setUnreadCount((unread as unknown[] | null)?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    channelRef.current = notificationsAPI.subscribeToUnread(user.id, (count) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnreadCount(count);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchNotifications();
    });
    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [user, fetchNotifications]);

  const markRead = useCallback(
    async (id: string) => {
      await notificationsAPI.markRead(id);
      await fetchNotifications();
    },
    [fetchNotifications]
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await notificationsAPI.markAllRead(user.id);
    await fetchNotifications();
  }, [user, fetchNotifications]);

  const remove = useCallback(
    async (id: string) => {
      await notificationsAPI.remove(id);
      await fetchNotifications();
    },
    [fetchNotifications]
  );

  return {
    notifications,
    unreadCount,
    loading,
    open,
    setOpen,
    markRead,
    markAllRead,
    remove,
    refetch: fetchNotifications,
  };
}
