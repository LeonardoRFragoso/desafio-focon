import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthContext } from '@/features/auth/useAuthContext';
import type { Notification } from '@/types/database';

const typeIcons: Record<string, string> = {
  entry_approved: '✓',
  entry_rejected: '✕',
  entry_submitted: '📋',
  entry_pending_reminder: '⏰',
  period_closing: '📅',
  budget_threshold: '⚠',
  comment_received: '💬',
  system: 'ℹ',
};

const typeColors: Record<string, string> = {
  entry_approved: 'text-green-600',
  entry_rejected: 'text-red-600',
  entry_submitted: 'text-blue-600',
  entry_pending_reminder: 'text-yellow-600',
  period_closing: 'text-blue-600',
  budget_threshold: 'text-orange-600',
  comment_received: 'text-purple-600',
  system: 'text-app-muted',
};

const typeFilterLabels: Record<string, string> = {
  entry_approved: 'Aprovações',
  entry_rejected: 'Rejeições',
  entry_submitted: 'Novos apontamentos',
  entry_pending_reminder: 'Lembretes',
  period_closing: 'Fechamento',
  budget_threshold: 'Orçamento',
  comment_received: 'Comentários',
  system: 'Sistema',
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
  const { isAdmin } = useAuthContext();
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = 'notification-panel';

  const handleNotificationClick = (n: Notification) => {
    // Mark as read
    if (!n.read_at) markRead(n.id);

    // Navigate based on entity type and user role
    if (n.entity_type === 'time_entry' && n.entity_id) {
      if (isAdmin) {
        // Admin: go to admin time entries history with entry param
        setOpen(false);
        navigate(`/admin/time-entries?entry=${n.entity_id}`);
      } else {
        // Member: go to their time entries page
        setOpen(false);
        navigate(`/time-entries?entry=${n.entity_id}`);
      }
    }
  };

  const filteredNotifications = useMemo(() => {
    if (!typeFilter) return notifications;
    return notifications.filter((n) => n.type === typeFilter);
  }, [notifications, typeFilter]);

  // Escape closes the panel and restores focus to the bell.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-hover-surface transition"
        aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
      >
        <svg className="w-5 h-5 text-app-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id={panelId}
            role="dialog"
            aria-label="Notificações"
            className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-surface-primary rounded-xl shadow-lg border border-app-primary z-50 flex flex-col max-h-[min(24rem,70vh)]"
          >
            <div className="shrink-0 bg-surface-primary border-b border-app-primary p-3 flex justify-between items-center rounded-t-xl">
              <h3 className="font-semibold text-app-primary">Notificações</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-focon-600 hover:text-focon-700 dark:text-focon-400 dark:hover:text-focon-300 font-medium"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="shrink-0 px-3 py-2 border-b border-app-primary">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-2 py-1.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-focon-600"
                >
                  <option value="">Todos os tipos</option>
                  {Object.entries(typeFilterLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto app-scrollbar">
              {loading ? (
                <div className="p-8 text-center text-sm text-app-muted">Carregando...</div>
              ) : filteredNotifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-app-muted">
                  {notifications.length === 0 ? 'Nenhuma notificação' : 'Nenhuma notificação deste tipo'}
                </div>
              ) : (
                <ul className="divide-y divide-table-divider">
                  {filteredNotifications.map((n: Notification) => (
                    <li
                      key={n.id}
                      className={`p-3 transition ${!n.read_at ? 'bg-primary-soft' : ''} ${n.entity_type ? 'hover:bg-hover-surface cursor-pointer' : ''}`}
                      onClick={() => n.entity_type && handleNotificationClick(n)}
                      role={n.entity_type ? 'button' : undefined}
                      tabIndex={n.entity_type ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (n.entity_type && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          handleNotificationClick(n);
                        }
                      }}
                    >
                      <div className="flex gap-3">
                        <span className={`text-lg flex-shrink-0 ${typeColors[n.type] || typeColors['system']}`}>
                          {typeIcons[n.type] || 'ℹ'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-app-primary">{n.title}</p>
                          {n.body && (
                            <p className="text-xs text-app-muted mt-0.5 break-words">{n.body}</p>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-slate-400">{formatTimeAgo(n.created_at)}</span>
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              {!n.read_at && (
                                <button
                                  onClick={() => markRead(n.id)}
                                  className="text-xs text-focon-600 hover:text-focon-700 dark:text-focon-400 dark:hover:text-focon-300 font-medium"
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
          </div>
        </>
      )}
    </div>
  );
}
