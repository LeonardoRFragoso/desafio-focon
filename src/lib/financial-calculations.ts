export interface ProjectFinancialData {
  contractedRevenue: number;
  taxRate: number;
  indirectCost: number;
  laborCost: number;
}

export interface FinancialSummary {
  contractedRevenue: number;
  laborCost: number;
  tax: number;
  indirectCost: number;
  result: number;
  margin: number;
}

/**
 * Calculate tax based on contracted revenue and tax rate
 */
export function calculateTax(
  contractedRevenue: number,
  taxRate: number
): number {
  return contractedRevenue * taxRate;
}

/**
 * Calculate result (profit/loss) for a project
 * Formula: contractedRevenue - laborCost - tax - indirectCost
 */
export function calculateResult(
  contractedRevenue: number,
  laborCost: number,
  tax: number,
  indirectCost: number
): number {
  return contractedRevenue - laborCost - tax - indirectCost;
}

/**
 * Calculate margin percentage
 * Formula: (result / contractedRevenue) * 100
 * Returns 0 if contractedRevenue is 0
 */
export function calculateMargin(
  result: number,
  contractedRevenue: number
): number {
  if (contractedRevenue === 0) {
    return 0;
  }
  return (result / contractedRevenue) * 100;
}

/**
 * Calculate complete financial summary for a project
 */
export function calculateProjectFinancialSummary(
  data: ProjectFinancialData
): FinancialSummary {
  const tax = calculateTax(data.contractedRevenue, data.taxRate);
  const result = calculateResult(
    data.contractedRevenue,
    data.laborCost,
    tax,
    data.indirectCost
  );
  const margin = calculateMargin(result, data.contractedRevenue);

  return {
    contractedRevenue: data.contractedRevenue,
    laborCost: data.laborCost,
    tax,
    indirectCost: data.indirectCost,
    result,
    margin,
  };
}

/**
 * Calculate aggregated financial summary for multiple projects
 */
export function calculateAggregatedFinancialSummary(
  projects: ProjectFinancialData[]
): FinancialSummary {
  const totals = projects.reduce(
    (acc, project) => ({
      contractedRevenue: acc.contractedRevenue + project.contractedRevenue,
      laborCost: acc.laborCost + project.laborCost,
      tax: acc.tax + calculateTax(project.contractedRevenue, project.taxRate),
      indirectCost: acc.indirectCost + project.indirectCost,
    }),
    {
      contractedRevenue: 0,
      laborCost: 0,
      tax: 0,
      indirectCost: 0,
    }
  );

  const result = calculateResult(
    totals.contractedRevenue,
    totals.laborCost,
    totals.tax,
    totals.indirectCost
  );
  const margin = calculateMargin(result, totals.contractedRevenue);

  return {
    contractedRevenue: totals.contractedRevenue,
    laborCost: totals.laborCost,
    tax: totals.tax,
    indirectCost: totals.indirectCost,
    result,
    margin,
  };
}
