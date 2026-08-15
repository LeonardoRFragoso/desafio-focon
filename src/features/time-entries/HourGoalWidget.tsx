import { useState, useEffect, useCallback } from 'react';
import { userPreferencesAPI, timeEntriesAPI } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';

const PREF_KEY = 'expected_weekly_minutes';

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

interface GoalStats {
  registered: number;
  approved: number;
  pending: number;
  rejected: number;
  goal: number;
  percent: number;
  remaining: number;
}

interface HourGoalWidgetProps {
  /** When this number increments, the widget opens its goal editor. Used by
   *  ProfessionalActionCenter's "Definir meta" CTA to reuse this form instead
   *  of creating a second configuration UI. */
  openEditorSignal?: number;
}

export function HourGoalWidget({ openEditorSignal }: HourGoalWidgetProps = {}) {
  const { user } = useAuthContext();
  const [goal, setGoal] = useState<number | null>(null);
  const [stats, setStats] = useState<GoalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [inputHours, setInputHours] = useState('40');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGoal = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await userPreferencesAPI.get(user.id, PREF_KEY);
      if (data?.pref_value && typeof data.pref_value === 'object') {
        const val = (data.pref_value as { minutes?: number }).minutes;
        if (typeof val === 'number' && val > 0) {
          setGoal(val);
          setInputHours(String(Math.round(val / 60)));
        }
      }
    } catch {
      // No preference set yet — that's fine
    }
  }, [user]);

  const fetchStats = useCallback(
    async (goalMinutes: number) => {
      if (!user) return;
      try {
        const weekStart = getWeekStart(new Date());
        const startDateStr = weekStart.toISOString().slice(0, 10);
        const { data, error: err } = await timeEntriesAPI.getByUser(user.id);
        if (err) throw err;

        interface RawEntry {
          entry_date: string;
          duration_minutes: number;
          approval_status: 'pending' | 'approved' | 'rejected';
        }

        const weekEntries = ((data as unknown as RawEntry[]) || []).filter(
          (e) => e.entry_date >= startDateStr
        );

        const registered = weekEntries
          .filter((e) => e.approval_status === 'approved' || e.approval_status === 'pending')
          .reduce((s, e) => s + e.duration_minutes, 0);
        const approved = weekEntries
          .filter((e) => e.approval_status === 'approved')
          .reduce((s, e) => s + e.duration_minutes, 0);
        const pending = weekEntries
          .filter((e) => e.approval_status === 'pending')
          .reduce((s, e) => s + e.duration_minutes, 0);
        const rejected = weekEntries
          .filter((e) => e.approval_status === 'rejected')
          .reduce((s, e) => s + e.duration_minutes, 0);

        const percent = goalMinutes > 0 ? Math.min((registered / goalMinutes) * 100, 100) : 0;
        const remaining = Math.max(goalMinutes - registered, 0);

        setStats({ registered, approved, pending, rejected, goal: goalMinutes, percent, remaining });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar estatísticas');
      }
    },
    [user]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGoal();
  }, [fetchGoal]);

  useEffect(() => {
    if (goal !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchStats(goal);
    } else {
      setLoading(false);
    }
  }, [goal, fetchStats]);

  // External trigger to open the goal editor (reused by Action Center CTA).
  useEffect(() => {
    if (openEditorSignal && openEditorSignal > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(true);
    }
  }, [openEditorSignal]);

  const handleSave = async () => {
    if (!user) return;
    const hours = parseFloat(inputHours);
    if (isNaN(hours) || hours < 0 || hours > 168) {
      setError('Meta inválida (0-168 horas).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const minutes = Math.round(hours * 60);
      const { error: err } = await userPreferencesAPI.set(user.id, PREF_KEY, { minutes });
      if (err) throw err;
      setGoal(minutes);
      setEditing(false);
      await fetchStats(minutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar meta');
    } finally {
      setSaving(false);
    }
  };

  if (loading && goal === null) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Meta Semanal</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Acompanhe sua produtividade</p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-focon-600 hover:text-focon-700 font-medium"
          >
            {goal ? 'Alterar' : 'Definir'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Horas esperadas por semana
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="168"
                step="0.5"
                value={inputHours}
                onChange={(e) => setInputHours(e.target.value)}
                className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">horas</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : goal === null ? (
        <div className="text-center py-6">
          <p className="text-slate-500 dark:text-slate-400 mb-3">Nenhuma meta definida</p>
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg text-sm font-medium transition"
          >
            Definir Meta
          </button>
        </div>
      ) : stats ? (
        <div className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatDuration(stats.registered)}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                de {formatDuration(stats.goal)}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  stats.percent >= 100
                    ? 'bg-green-500'
                    : stats.percent >= 75
                      ? 'bg-focon-500'
                      : 'bg-yellow-500'
                }`}
                style={{ width: `${stats.percent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {stats.percent.toFixed(0)}%
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {stats.remaining > 0 ? `Faltam ${formatDuration(stats.remaining)}` : 'Meta atingida!'}
              </span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 text-center">
              <p className="text-xs text-green-700 dark:text-green-400 font-medium">Aprovado</p>
              <p className="text-lg font-bold text-green-800 dark:text-green-300">{formatDuration(stats.approved)}</p>
            </div>
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 text-center">
              <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Pendente</p>
              <p className="text-lg font-bold text-yellow-800 dark:text-yellow-300">{formatDuration(stats.pending)}</p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-center">
              <p className="text-xs text-red-700 dark:text-red-400 font-medium">Rejeitado</p>
              <p className="text-lg font-bold text-red-800 dark:text-red-300">{formatDuration(stats.rejected)}</p>
            </div>
            <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-center">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Registrado</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatDuration(stats.registered)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
