import { WeeklyCalendar } from '@/features/time-entries/WeeklyCalendar';

export function WeeklyCalendarPage() {
  return (
    <div className="space-y-8">
      <div className="border-b border-app-primary pb-6">
        <h1 className="text-4xl font-bold text-app-primary">Calendário Semanal</h1>
        <p className="mt-2 text-lg text-app-muted">
          Visualize seus apontamentos por semana
        </p>
      </div>

      <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
        <WeeklyCalendar />
      </div>
    </div>
  );
}
