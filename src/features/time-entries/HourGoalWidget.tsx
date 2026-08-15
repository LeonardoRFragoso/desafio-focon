import { useState, useEffect } from 'react';
import type { ProfessionalDashboardStats } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { formatDuration, minutesToHoursInput } from '@/lib/duration';
import { useWeeklyGoal, MAX_GOAL_HOURS } from './useWeeklyGoal';

interface HourGoalWidgetProps {
  /** The weekly_goal block from the RPC (single source of truth). Provided by
   *  ProfessionalDashboard which already fetches get_professional_dashboard_stats. */
  weeklyGoal: ProfessionalDashboardStats['weekly_goal'] | null;
  /** When this number increments, the widget opens its goal editor. Used by
   *  ProfessionalActionCenter's "Definir meta" CTA to reuse this form instead
   *  of creating a second configuration UI. */
  openEditorSignal?: number;
  /** Callback fired after the goal is saved or removed, so the dashboard can
   *  refresh the Action Center and any other consumers. */
  onGoalChanged?: () => void;
}

export function HourGoalWidget({ weeklyGoal, openEditorSignal, onGoalChanged }: HourGoalWidgetProps) {
  const { user } = useAuthContext();
  const [editing, setEditing] = useState(false);
  const [inputHours, setInputHours] = useState('40');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The canonical numbers come from the RPC via the shared hook.
  // This widget does NOT replicate the aggregation math client-side.
  const { saveGoal, removeGoal } = useWeeklyGoal(weeklyGoal, (stats) => {
    // The hook refetched the RPC; notify the parent so Action Center updates.
    onGoalChanged?.();
    // Update the input to reflect the saved value (preserves fractions).
    if (stats.weekly_goal.configured && stats.weekly_goal.goal_minutes !== null) {
      setInputHours(minutesToHoursInput(stats.weekly_goal.goal_minutes));
    }
  });

  // Pre-fill the editor input with the current goal (or default 40h) when
  // the weeklyGoal data arrives. Preserves fractional values (e.g. 37.5h).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (weeklyGoal?.configured && weeklyGoal.goal_minutes !== null) {
      setInputHours(minutesToHoursInput(weeklyGoal.goal_minutes));
    } else if (!weeklyGoal?.configured) {
      setInputHours('40');
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [weeklyGoal?.configured, weeklyGoal?.goal_minutes]);

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
    if (isNaN(hours) || hours <= 0 || hours > MAX_GOAL_HOURS) {
      setError(`A meta deve ser maior que 0 horas e no máximo ${MAX_GOAL_HOURS} horas.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await saveGoal(hours);
      if (saveError) {
        setError(saveError);
        return;
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar meta');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const { error: removeError } = await removeGoal();
      if (removeError) {
        setError(removeError);
        return;
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover meta');
    } finally {
      setSaving(false);
    }
  };

  const configured = weeklyGoal?.configured ?? false;
  const loading = !weeklyGoal;

  if (loading) {
    return (
      <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
        <div className="animate-pulse">
          <div className="h-6 bg-surface-elevated rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-surface-elevated rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-app-primary">Meta Semanal</h3>
          <p className="text-sm text-app-muted">Acompanhe sua produtividade</p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-focon-600 hover:text-focon-700 font-medium"
          >
            {configured ? 'Alterar' : 'Definir'}
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
            <label className="block text-sm font-medium text-app-secondary mb-1">
              Horas esperadas por semana
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.5"
                max={MAX_GOAL_HOURS}
                step="0.5"
                value={inputHours}
                onChange={(e) => setInputHours(e.target.value)}
                className="w-24 px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              />
              <span className="text-sm text-app-muted">horas</span>
            </div>
            <p className="mt-1 text-xs text-app-muted">
              Valores fracionados são aceitos (ex.: 37,5h). A meta deve ser maior que 0.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            {configured && (
              <button
                onClick={handleRemove}
                disabled={saving}
                className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium transition hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                Remover meta
              </button>
            )}
            <button
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
              className="px-4 py-2 border border-app-strong text-app-secondary rounded-lg text-sm font-medium transition hover:bg-hover-surface disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : !configured ? (
        <div className="text-center py-6">
          <p className="text-app-muted mb-3">Nenhuma meta definida</p>
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg text-sm font-medium transition"
          >
            Definir Meta
          </button>
        </div>
      ) : weeklyGoal ? (
        <div className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-2xl font-bold text-app-primary">
                {formatDuration(weeklyGoal.registered_minutes)}
              </span>
              <span className="text-sm text-app-muted">
                de {formatDuration(weeklyGoal.goal_minutes ?? 0)}
              </span>
            </div>
            <div className="w-full bg-surface-elevated rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (weeklyGoal.progress_percent ?? 0) >= 100
                    ? 'bg-green-500'
                    : (weeklyGoal.progress_percent ?? 0) >= 75
                      ? 'bg-focon-500'
                      : 'bg-yellow-500'
                }`}
                style={{ width: `${weeklyGoal.progress_percent ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="font-medium text-app-secondary">
                {(weeklyGoal.progress_percent ?? 0).toFixed(0)}%
              </span>
              <span className="text-app-muted">
                {(weeklyGoal.remaining_minutes ?? 0) > 0
                  ? `Faltam ${formatDuration(weeklyGoal.remaining_minutes ?? 0)}`
                  : 'Meta atingida!'}
              </span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 text-center">
              <p className="text-xs text-green-700 dark:text-green-400 font-medium">Aprovado</p>
              <p className="text-lg font-bold text-green-800 dark:text-green-300">{formatDuration(weeklyGoal.approved_minutes)}</p>
            </div>
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 text-center">
              <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Pendente</p>
              <p className="text-lg font-bold text-yellow-800 dark:text-yellow-300">{formatDuration(weeklyGoal.pending_minutes)}</p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-center">
              <p className="text-xs text-red-700 dark:text-red-400 font-medium">Rejeitado</p>
              <p className="text-lg font-bold text-red-800 dark:text-red-300">{formatDuration(weeklyGoal.rejected_minutes)}</p>
            </div>
            <div className="rounded-lg bg-surface-secondary p-3 text-center">
              <p className="text-xs text-app-muted font-medium">Registrado</p>
              <p className="text-lg font-bold text-app-secondary">{formatDuration(weeklyGoal.registered_minutes)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
