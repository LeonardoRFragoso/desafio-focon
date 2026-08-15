import { useState, useEffect, useCallback, useMemo } from 'react';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';

interface CalendarEntry {
  id: string;
  project_name: string;
  entry_date: string;
  duration_minutes: number;
  description: string;
  approval_status: 'pending' | 'approved' | 'rejected';
}

interface DayGroup {
  date: Date;
  entries: CalendarEntry[];
  totalMinutes: number;
}

interface WeekData {
  days: DayGroup[];
  totalMinutes: number;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const dayNamesLong = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

export function WeeklyCalendar() {
  const { user } = useAuthContext();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(
    async (start: Date) => {
      if (!user) return;
      try {
        setLoading(true);
        setError(null);
        const weekEnd = addWeeks(start, 1);
        const startDateStr = dateKey(start);
        const endDateStr = dateKey(new Date(weekEnd.getTime() - 1));

        const { data, error: err } = await timeEntriesAPI.getByUser(user.id);
        if (err) throw err;

        interface RawEntry {
          id: string;
          projects: { name: string } | null;
          entry_date: string;
          duration_minutes: number;
          description: string;
          approval_status: 'pending' | 'approved' | 'rejected';
        }

        const filtered = ((data as unknown as RawEntry[]) || [])
          .filter((e) => e.entry_date >= startDateStr && e.entry_date <= endDateStr)
          .map((e) => ({
            id: e.id,
            project_name: e.projects?.name || 'Desconhecido',
            entry_date: e.entry_date,
            duration_minutes: e.duration_minutes,
            description: e.description,
            approval_status: e.approval_status,
          }));
        setEntries(filtered);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar apontamentos');
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries(weekStart);
  }, [fetchEntries, weekStart]);

  const weekData: WeekData = useMemo(() => {
    const days: DayGroup[] = [];
    let totalMinutes = 0;
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dKey = dateKey(date);
      const dayEntries = entries.filter((e) => e.entry_date === dKey);
      const dayTotal = dayEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
      days.push({ date, entries: dayEntries, totalMinutes: dayTotal });
      totalMinutes += dayTotal;
    }
    return { days, totalMinutes };
  }, [entries, weekStart]);

  const isCurrentWeek = useMemo(() => {
    const currentWeekStart = getWeekStart(new Date());
    return weekStart.getTime() === currentWeekStart.getTime();
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    const end = addWeeks(weekStart, 1);
    end.setDate(end.getDate() - 1);
    if (weekStart.getMonth() === end.getMonth()) {
      return `${weekStart.getDate()} – ${end.getDate()} ${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return `${weekStart.getDate()} ${monthNames[weekStart.getMonth()]} – ${end.getDate()} ${monthNames[end.getMonth()]} ${weekStart.getFullYear()}`;
  }, [weekStart]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            className="p-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition"
            aria-label="Semana anterior"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            disabled={isCurrentWeek}
            className="px-3 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hoje
          </button>
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="p-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition"
            aria-label="Próxima semana"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="text-sm font-medium text-app-secondary">{weekLabel}</div>
        <div className="text-sm font-semibold text-focon-700 dark:text-focon-400">
          Total: {formatDuration(weekData.totalMinutes)}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
        </div>
      ) : (
        <>
          {/* Desktop: 7-column grid */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {weekData.days.map((day, i) => (
              <div
                key={i}
                className={`rounded-lg border min-h-[200px] flex flex-col ${
                  day.date.toDateString() === new Date().toDateString()
                    ? 'border-focon-400 dark:border-focon-600 bg-focon-50 dark:bg-focon-900/10'
                    : 'border-app-primary bg-surface-primary'
                }`}
              >
                <div className="p-2 border-b border-app-primary">
                  <p className="text-xs font-semibold text-app-muted">{dayNames[i]}</p>
                  <p className="text-lg font-bold text-app-primary">{day.date.getDate()}</p>
                  {day.totalMinutes > 0 && (
                    <p className="text-xs text-focon-600 dark:text-focon-400 font-medium">
                      {formatDuration(day.totalMinutes)}
                    </p>
                  )}
                </div>
                <div className="p-1.5 space-y-1.5 flex-1 overflow-y-auto" style={{ maxHeight: '350px' }}>
                  {day.entries.length === 0 ? (
                    <p className="text-xs text-slate-400 text-app-muted text-center py-4">—</p>
                  ) : (
                    day.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-md p-1.5 text-xs bg-surface-secondary border border-app-primary"
                      >
                        <p className="font-medium text-app-secondary truncate">{entry.project_name}</p>
                        <p className="text-app-muted">{formatDuration(entry.duration_minutes)}</p>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mt-0.5 ${statusColors[entry.approval_status]}`}>
                          {statusLabels[entry.approval_status]}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: card list by day */}
          <div className="md:hidden space-y-3">
            {weekData.days.map((day, i) => (
              <div
                key={i}
                className={`rounded-lg border ${
                  day.date.toDateString() === new Date().toDateString()
                    ? 'border-focon-400 dark:border-focon-600 bg-focon-50 dark:bg-focon-900/10'
                    : 'border-app-primary bg-surface-primary'
                }`}
              >
                <div className="p-3 border-b border-app-primary flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-app-muted">{dayNamesLong[i]}</p>
                    <p className="text-xl font-bold text-app-primary">
                      {day.date.getDate()} {monthNames[day.date.getMonth()]}
                    </p>
                  </div>
                  {day.totalMinutes > 0 && (
                    <p className="text-sm font-semibold text-focon-600 dark:text-focon-400">
                      {formatDuration(day.totalMinutes)}
                    </p>
                  )}
                </div>
                <div className="p-2 space-y-2">
                  {day.entries.length === 0 ? (
                    <p className="text-sm text-slate-400 text-app-muted text-center py-3">Sem apontamentos</p>
                  ) : (
                    day.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-md p-2 bg-surface-secondary border border-app-primary"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-medium text-sm text-app-secondary">{entry.project_name}</p>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${statusColors[entry.approval_status]}`}>
                            {statusLabels[entry.approval_status]}
                          </span>
                        </div>
                        <p className="text-sm text-app-muted mt-1">{formatDuration(entry.duration_minutes)}</p>
                        <p className="text-xs text-app-muted mt-1 line-clamp-2">{entry.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
