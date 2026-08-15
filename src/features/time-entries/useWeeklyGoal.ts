import { useCallback, useState } from 'react';
import { userPreferencesAPI, commandCenterAPI } from '@/lib/supabase/api';
import type { ProfessionalDashboardStats } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { hoursInputToMinutes } from '@/lib/duration';

const PREF_KEY = 'expected_weekly_minutes';

/**
 * Validation bounds for the weekly goal.
 * A valid goal is strictly greater than 0 and at most 168h (24h * 7 days).
 * 0 hours is NOT a valid goal — use `removeGoal` to clear the preference.
 */
export const MIN_GOAL_HOURS = 0.5; // step=0.5, so the smallest valid goal is 30min
export const MAX_GOAL_HOURS = 168;

export interface UseWeeklyGoalResult {
  /** The weekly_goal block from the RPC (single source of truth for numbers). */
  weeklyGoal: ProfessionalDashboardStats['weekly_goal'] | null;
  /** True while the initial RPC load or a refetch is in progress. */
  loading: boolean;
  /** Save a goal in hours (fractional allowed, e.g. 37.5). Persists the
   *  preference and refetches the RPC so both widgets update immediately. */
  saveGoal: (hours: number) => Promise<{ error: string | null }>;
  /** Remove the goal preference entirely and refetch. */
  removeGoal: () => Promise<{ error: string | null }>;
  /** Re-run the RPC to refresh the weekly_goal block. */
  refetch: () => Promise<void>;
}

/**
 * Shared weekly-goal hook — single source of truth.
 *
 * The canonical aggregation (approved + pending = registered, week range,
 * rejected exclusion, progress %) is computed by the
 * `get_professional_dashboard_stats` RPC. This hook does NOT replicate that
 * math client-side. It only:
 *   1. Holds the `weekly_goal` block returned by the RPC.
 *   2. Persists goal changes to `user_preferences`.
 *   3. Refetches the RPC after a save/remove so both consumers
 *      (HourGoalWidget + ProfessionalActionCenter) see consistent data.
 *
 * The initial `weeklyGoal` is seeded by the caller (ProfessionalDashboard)
 * which already fetches the RPC for the Action Center. After that, this hook
 * manages refetches.
 */
export function useWeeklyGoal(
  initialWeeklyGoal: ProfessionalDashboardStats['weekly_goal'] | null,
  onStatsRefetched?: (stats: ProfessionalDashboardStats) => void
): UseWeeklyGoalResult {
  const { user } = useAuthContext();
  const [weeklyGoal, setWeeklyGoal] = useState<ProfessionalDashboardStats['weekly_goal'] | null>(
    initialWeeklyGoal
  );
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await commandCenterAPI.getProfessionalStats(user.id);
      if (error || !data) return;
      const stats = data as unknown as ProfessionalDashboardStats;
      setWeeklyGoal(stats.weekly_goal);
      onStatsRefetched?.(stats);
    } catch {
      // Swallow — the caller's existing data remains
    } finally {
      setLoading(false);
    }
  }, [user, onStatsRefetched]);

  const saveGoal = useCallback(
    async (hours: number): Promise<{ error: string | null }> => {
      if (!user) return { error: 'Usuário não autenticado' };
      if (isNaN(hours) || hours <= 0 || hours > MAX_GOAL_HOURS) {
        return { error: `A meta deve ser maior que 0 horas e no máximo ${MAX_GOAL_HOURS} horas.` };
      }
      const minutes = hoursInputToMinutes(hours);
      const { error: prefError } = await userPreferencesAPI.set(user.id, PREF_KEY, { minutes });
      if (prefError) {
        return { error: prefError.message || 'Erro ao salvar meta' };
      }
      await refetch();
      return { error: null };
    },
    [user, refetch]
  );

  const removeGoal = useCallback(async (): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Usuário não autenticado' };
    // Delete the preference row so configured=false on next RPC call.
    const { error: delError } = await userPreferencesAPI.remove(user.id, PREF_KEY);
    if (delError) {
      return { error: delError.message || 'Erro ao remover meta' };
    }
    await refetch();
    return { error: null };
  }, [user, refetch]);

  return { weeklyGoal, loading, saveGoal, removeGoal, refetch };
}
