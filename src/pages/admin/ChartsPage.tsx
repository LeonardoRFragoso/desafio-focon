import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { projectsAPI } from '@/lib/supabase/api';
import type { Project } from '@/types/database';

const COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

interface TimeEntryRow {
  entry_date: string;
  duration_minutes: number;
  approval_status: string;
  applied_hourly_rate: number;
  project_id: string;
  projects: { name: string } | null;
  professional_id: string;
  profiles: { full_name: string } | null;
}

export function ChartsPage() {
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('30'); // days

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const days = parseInt(periodFilter, 10);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().slice(0, 10);

      let query = supabase
        .from('time_entries')
        .select(`
          entry_date, duration_minutes, approval_status, applied_hourly_rate,
          project_id, projects!time_entries_project_id_fkey(name),
          professional_id, profiles!time_entries_professional_id_fkey(full_name)
        `)
        .gte('entry_date', startDateStr)
        .order('entry_date', { ascending: true });

      if (projectFilter) query = query.eq('project_id', projectFilter);

      const { data, error: err } = await query;
      if (err) throw err;
      setEntries((data as TimeEntryRow[]) || []);

      const { data: projData } = await projectsAPI.listActive();
      setProjects((projData as Project[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [projectFilter, periodFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Hours by period (daily)
  const hoursByDay = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => {
      const day = e.entry_date;
      map.set(day, (map.get(day) || 0) + e.duration_minutes / 60);
    });
    return Array.from(map.entries())
      .map(([date, hours]) => ({ date: date.slice(5), hours: parseFloat(hours.toFixed(1)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  // Hours by project
  const hoursByProject = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => {
      const name = e.projects?.name || 'Desconhecido';
      map.set(name, (map.get(name) || 0) + e.duration_minutes / 60);
    });
    return Array.from(map.entries())
      .map(([name, hours]) => ({ name, hours: parseFloat(hours.toFixed(1)) }))
      .sort((a, b) => b.hours - a.hours);
  }, [entries]);

  // Hours by professional
  const hoursByProfessional = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => {
      const name = e.profiles?.full_name || 'Desconhecido';
      map.set(name, (map.get(name) || 0) + e.duration_minutes / 60);
    });
    return Array.from(map.entries())
      .map(([name, hours]) => ({ name, hours: parseFloat(hours.toFixed(1)) }))
      .sort((a, b) => b.hours - a.hours);
  }, [entries]);

  // Financial breakdown
  const financialData = useMemo(() => {
    let labor = 0;
    entries.forEach((e) => {
      if (e.approval_status === 'approved') {
        labor += (e.duration_minutes / 60) * e.applied_hourly_rate;
      }
    });
    // We don't have revenue/tax/indirect in time_entries, so show what we have
    return [
      { name: 'Mão de Obra (Aprovada)', value: parseFloat(labor.toFixed(2)) },
    ];
  }, [entries]);

  // Budget vs Actual — fetch in useEffect instead of async useMemo
  const [budgetChart, setBudgetChart] = useState<{ name: string; Previsto: number; Realizado: number }[]>([]);
  useEffect(() => {
    const fetchBudgetData = async () => {
      const { data: budgets } = await supabase
        .from('project_budgets')
        .select('project_id, budget_type, budget_value, projects!project_budgets_project_id_fkey(name)')
        .eq('budget_type', 'labor_hours');
      if (!budgets) {
        setBudgetChart([]);
        return;
      }
      const chartData = budgets.map((b) => {
        const actual = entries
          .filter((e) => e.project_id === b.project_id && e.approval_status === 'approved')
          .reduce((s, e) => s + e.duration_minutes / 60, 0);
        return {
          name: b.projects?.name || 'Desconhecido',
          Previsto: b.budget_value,
          Realizado: parseFloat(actual.toFixed(1)),
        };
      });
      setBudgetChart(chartData);
    };
    fetchBudgetData();
  }, [entries]);

  const hasData = entries.length > 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Gráficos Gerenciais</h2>
        <p className="text-slate-600 dark:text-slate-400">Visualize horas, financeiro e orçamento</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Período</label>
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="180">180 dias</option>
            <option value="365">1 ano</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Projeto</label>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {!hasData ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-900">
          <p className="text-slate-600 dark:text-slate-400">Sem dados para o período selecionado</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">Ajuste os filtros ou aguarde novos apontamentos</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hours by Day */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Horas por Dia</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={hoursByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="hours" stroke="#0d9488" strokeWidth={2} name="Horas" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hours by Project */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Horas por Projeto</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hoursByProject}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="hours" fill="#0d9488" name="Horas" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Hours by Professional */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Horas por Profissional</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hoursByProfessional} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={100} />
                  <Tooltip />
                  <Bar dataKey="hours" fill="#3b82f6" name="Horas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Financial */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Financeiro</h3>
            {financialData.length > 0 && financialData[0] && financialData[0].value > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={financialData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {financialData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length] ?? '#0d9488'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-slate-500 dark:text-slate-400 py-12">Sem dados financeiros aprovados no período</p>
            )}
          </div>

          {/* Budget vs Actual */}
          {budgetChart.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Orçamento × Realizado (Horas)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={budgetChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Previsto" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Realizado" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
