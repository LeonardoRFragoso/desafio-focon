import { useState, useMemo } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import type { Notification } from '@/types/database';

const typeIcons: Record<string, string> = {
  entry_approved: '✓',
  entry_rejected: '✕',
  entry_pending_reminder: '⏰',
  period_closing: '📅',
  budget_threshold: '⚠',
  comment_received: '💬',
  system: 'ℹ',
};

const typeColors: Record<string, string> = {
  entry_approved: 'text-green-600',
  entry_rejected: 'text-red-600',
  entry_pending_reminder: 'text-yellow-600',
  period_closing: 'text-blue-600',
  budget_threshold: 'text-orange-600',
  comment_received: 'text-purple-600',
  system: 'text-slate-600 dark:text-slate-400',
};

function formatTimeAgo(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationBell() {
  const { notifications, unreadCount, loading, open, setOpen, markRead, markAllRead, remove } =
    useNotifications();
  const [typeFilter, setTypeFilter] = useState('');

  const filteredNotifications = useMemo(() => {
    if (!typeFilter) return notifications;
    return notifications.filter((n) => n.type === typeFilter);
  }, [notifications, typeFilter]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}
      >
        <svg className="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-50 max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Notificações</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-focon-600 hover:text-focon-700 font-medium"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-focon-600"
                >
                  <option value="">Todos os tipos</option>
                  <option value="entry_approved">Aprovações</option>
                  <option value="entry_rejected">Rejeições</option>
                  <option value="entry_pending_reminder">Lembretes</option>
                  <option value="period_closing">Fechamento</option>
                  <option value="budget_threshold">Orçamento</option>
                  <option value="comment_received">Comentários</option>
                  <option value="system">Sistema</option>
                </select>
              </div>
            )}

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Carregando...</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {notifications.length === 0 ? 'Nenhuma notificação' : 'Nenhuma notificação deste tipo'}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredNotifications.map((n: Notification) => (
                  <li
                    key={n.id}
                    className={`p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${!n.read_at ? 'bg-focon-50 dark:bg-slate-800/50' : ''}`}
                  >
                    <div className="flex gap-3">
                      <span className={`text-lg flex-shrink-0 ${typeColors[n.type] || typeColors['system']}`}>
                        {typeIcons[n.type] || 'ℹ'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                        {n.body && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 break-words">{n.body}</p>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-slate-400">{formatTimeAgo(n.created_at)}</span>
                          <div className="flex gap-2">
                            {!n.read_at && (
                              <button
                                onClick={() => markRead(n.id)}
                                className="text-xs text-focon-600 hover:text-focon-700 font-medium"
                              >
                                Ler
                              </button>
                            )}
                            <button
                              onClick={() => remove(n.id)}
                              className="text-xs text-slate-400 hover:text-red-600"
                              aria-label="Excluir notificação"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
