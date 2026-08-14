import { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { FinancialIndicators } from '@/features/admin/FinancialIndicators';
import { AdminFilters } from '@/features/admin/AdminFilters';
import { ProfessionalSummary } from '@/features/admin/ProfessionalSummary';
import { TimeEntryApproval } from '@/features/admin/TimeEntryApproval';
import { TimeEntriesBreakdown } from '@/features/admin/TimeEntriesBreakdown';
import { supabase } from '@/lib/supabase/client';

interface FilterValues {
  projectId: string;
  professionalId: string;
  startDate: string;
  endDate: string;
}

interface ProfessionalData {
  professional_id: string;
  professional_name: string;
  total_hours: number;
  hourly_rates: number[];
  total_cost: number;
}

export function DashboardPage() {
  const [revenue, setRevenue] = useState(0);
  const [laborCost, setLaborCost] = useState(0);
  const [result, setResult] = useState(0);
  const [margin, setMargin] = useState(0);
  const [professionalData, setProfessionalData] = useState<ProfessionalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({
    projectId: '',
    professionalId: '',
    startDate: '',
    endDate: '',
  });

  const fetchFinancialData = useCallback(async () => {
    try {

      // Build query for time entries
      let query = supabase
        .from('time_entries')
        .select(
          `
          id,
          project_id,
          professional_id,
          duration_minutes,
          applied_hourly_rate,
          approval_status,
          entry_date,
          project:projects!time_entries_project_id_fkey(name),
          professional:profiles!time_entries_professional_id_fkey(full_name)
        `
        )
        .eq('approval_status', 'approved');

      if (filters.projectId) {
        query = query.eq('project_id', filters.projectId);
      }
      if (filters.professionalId) {
        query = query.eq('professional_id', filters.professionalId);
      }
      if (filters.startDate) {
        query = query.gte('entry_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('entry_date', filters.endDate);
      }

      const { data: entries, error: entriesError } = await query;
      if (entriesError) throw entriesError;

      // Get projects for revenue calculation
      let projectQuery = supabase
        .from('project_financials')
        .select('project_id, contracted_revenue, tax_rate, indirect_cost, project:projects!project_financials_project_id_fkey(name)');

      if (filters.projectId) {
        projectQuery = projectQuery.eq('project_id', filters.projectId);
      }

      const { data: financials, error: financialsError } = await projectQuery;
      if (financialsError) throw financialsError;

      // Calculate totals
      let totalRevenue = 0;
      let totalLaborCost = 0;
      let totalIndirectCost = 0;
      let totalTax = 0;

      const projectMap = new Map(
        financials?.map((f) => [f.project_id, f]) || []
      );

      // Calculate labor cost and group by professional
      const profMap = new Map<string, ProfessionalData>();

      interface TimeEntry {
        professional_id: string;
        duration_minutes: number;
        applied_hourly_rate: number;
        professional?: Array<{ full_name: string }>;
      }

      (entries as TimeEntry[] | undefined)?.forEach((entry) => {
        const cost = (entry.duration_minutes / 60) * entry.applied_hourly_rate;
        totalLaborCost += cost;

        const profId = entry.professional_id;
        const profName = entry.professional?.[0]?.full_name || 'Desconhecido';

        if (!profMap.has(profId)) {
          profMap.set(profId, {
            professional_id: profId,
            professional_name: profName,
            total_hours: 0,
            hourly_rates: [],
            total_cost: 0,
          });
        }

        const prof = profMap.get(profId)!;
        prof.total_hours += entry.duration_minutes;
        prof.total_cost += cost;
        
        // Add hourly rate if not already present
        if (!prof.hourly_rates.includes(entry.applied_hourly_rate)) {
          prof.hourly_rates.push(entry.applied_hourly_rate);
        }
      });

      // Calculate revenue and taxes
      projectMap.forEach((financial) => {
        totalRevenue += financial.contracted_revenue;
        totalTax += financial.contracted_revenue * financial.tax_rate;
        totalIndirectCost += financial.indirect_cost;
      });

      const totalResult = totalRevenue - totalLaborCost - totalTax - totalIndirectCost;
      const totalMargin = totalRevenue > 0 ? (totalResult / totalRevenue) * 100 : 0;

      setRevenue(totalRevenue);
      setLaborCost(totalLaborCost);
      setResult(totalResult);
      setMargin(totalMargin);
      setProfessionalData(Array.from(profMap.values()));
    } catch (err) {
      console.error('Erro ao carregar dados financeiros:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.projectId, filters.professionalId, filters.startDate, filters.endDate]);

  useEffect(() => {
    let isMounted = true;
    
    const load = async () => {
      await fetchFinancialData();
    };
    
    if (isMounted) {
      load();
    }
    
    return () => {
      isMounted = false;
    };
  }, [fetchFinancialData]);

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Painel Administrativo</h1>
          <p className="mt-2 text-slate-600">
            Acompanhe a produção e rentabilidade dos projetos
          </p>
        </div>

        <AdminFilters onFilterChange={handleFilterChange} />

        <FinancialIndicators
          revenue={revenue}
          laborCost={laborCost}
          result={result}
          margin={margin}
          loading={loading}
        />

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">
            Resumo por Profissional
          </h2>
          <ProfessionalSummary data={professionalData} loading={loading} />
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <TimeEntryApproval />
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">
            Detalhamento de Apontamentos
          </h2>
          <TimeEntriesBreakdown filters={filters} />
        </div>
      </div>
    </Layout>
  );
}
