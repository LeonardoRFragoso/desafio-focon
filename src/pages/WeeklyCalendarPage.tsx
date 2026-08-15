import { WeeklyCalendar } from '@/features/time-entries/WeeklyCalendar';

export function WeeklyCalendarPage() {
  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-700 pb-6">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Calendário Semanal</h1>
        <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
          Visualize seus apontamentos por semana
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
        <WeeklyCalendar />
      </div>
    </div>
  );
}
