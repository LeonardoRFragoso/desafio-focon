import { useState, useCallback, useEffect } from 'react';
import { financialAPI } from '@/lib/supabase/api';
import { mapDatabaseError, logError } from '@/lib/errors';
import type { AdminFilterValues } from '@/types/admin';
import type { TimeEntryWithRelations } from '@/types/database';

interface ProfessionalData {
  professional_id: string;
  professional_name: string;
  total_hours: number;
  hourly_rates: number[];
  total_cost: number;
}

interface UseFinancialDataReturn {
  revenue: number;
  laborCost: number;
  result: number;
  margin: number;
  professionalData: ProfessionalData[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for fetching and calculating financial data
 */
export function useFinancialData(filters: AdminFilterValues): UseFinancialDataReturn {
  const [revenue, setRevenue] = useState(0);
  const [laborCost, setLaborCost] = useState(0);
  const [result, setResult] = useState(0);
  const [margin, setMargin] = useState(0);
  const [professionalData, setProfessionalData] = useState<ProfessionalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFinancialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch approved time entries
      const { data: entries, error: entriesError } = await financialAPI.getApprovedTimeEntries(filters);
      if (entriesError) throw entriesError;

      // Fetch project financials
      const { data: financials, error: financialsError } = await financialAPI.getProjectFinancials({
        projectId: filters.projectId,
      });
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

      // Filter defensively to only include approved entries
      (entries as TimeEntryWithRelations[] | undefined)
        ?.filter((entry) => entry.approval_status === 'approved')
        .forEach((entry) => {
          const cost = (entry.duration_minutes / 60) * entry.applied_hourly_rate;
          totalLaborCost += cost;

        const profId = entry.professional_id;
        const profName = entry.professional?.full_name || 'Desconhecido';

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
      const message = err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar dados financeiros';
      setError(message);
      logError(err, 'useFinancialData');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFinancialData();
  }, [fetchFinancialData]);

  return {
    revenue,
    laborCost,
    result,
    margin,
    professionalData,
    loading,
    error,
    refetch: fetchFinancialData,
  };
}
