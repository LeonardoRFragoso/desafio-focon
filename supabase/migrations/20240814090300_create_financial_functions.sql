-- Function to calculate labor cost for a project
CREATE OR REPLACE FUNCTION calculate_labor_cost(
  p_project_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_cost NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM((te.duration_minutes / 60.0) * te.applied_hourly_rate), 0)
  INTO v_cost
  FROM time_entries te
  WHERE te.project_id = p_project_id
    AND te.approval_status = 'approved'
    AND (p_start_date IS NULL OR te.entry_date >= p_start_date)
    AND (p_end_date IS NULL OR te.entry_date <= p_end_date);

  RETURN v_cost;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to calculate tax for a project
CREATE OR REPLACE FUNCTION calculate_tax(
  p_project_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_revenue NUMERIC;
  v_tax_rate NUMERIC;
BEGIN
  SELECT pf.contracted_revenue, pf.tax_rate
  INTO v_revenue, v_tax_rate
  FROM project_financials pf
  WHERE pf.project_id = p_project_id;

  IF v_revenue IS NULL THEN
    RETURN 0;
  END IF;

  RETURN v_revenue * v_tax_rate;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to calculate result for a project
CREATE OR REPLACE FUNCTION calculate_result(
  p_project_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_revenue NUMERIC;
  v_labor_cost NUMERIC;
  v_tax NUMERIC;
  v_indirect_cost NUMERIC;
BEGIN
  SELECT pf.contracted_revenue, pf.indirect_cost
  INTO v_revenue, v_indirect_cost
  FROM project_financials pf
  WHERE pf.project_id = p_project_id;

  IF v_revenue IS NULL THEN
    RETURN 0;
  END IF;

  v_labor_cost := calculate_labor_cost(p_project_id, p_start_date, p_end_date);
  v_tax := calculate_tax(p_project_id);

  RETURN v_revenue - v_labor_cost - v_tax - v_indirect_cost;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to calculate margin for a project
CREATE OR REPLACE FUNCTION calculate_margin(
  p_project_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_revenue NUMERIC;
  v_result NUMERIC;
BEGIN
  SELECT contracted_revenue
  INTO v_revenue
  FROM project_financials
  WHERE project_id = p_project_id;

  IF v_revenue IS NULL OR v_revenue = 0 THEN
    RETURN 0;
  END IF;

  v_result := calculate_result(p_project_id, p_start_date, p_end_date);

  RETURN (v_result / v_revenue) * 100;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to get project financial summary (admin only)
CREATE OR REPLACE FUNCTION get_project_financial_summary(
  p_project_id UUID
)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  contracted_revenue NUMERIC,
  labor_cost NUMERIC,
  tax NUMERIC,
  indirect_cost NUMERIC,
  result NUMERIC,
  margin NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    pf.contracted_revenue,
    calculate_labor_cost(p.id),
    calculate_tax(p.id),
    pf.indirect_cost,
    calculate_result(p.id),
    calculate_margin(p.id)
  FROM projects p
  LEFT JOIN project_financials pf ON p.id = pf.project_id
  WHERE p.id = p_project_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to get aggregated financial summary (admin only)
CREATE OR REPLACE FUNCTION get_aggregated_financial_summary()
RETURNS TABLE (
  total_revenue NUMERIC,
  total_labor_cost NUMERIC,
  total_tax NUMERIC,
  total_indirect_cost NUMERIC,
  total_result NUMERIC,
  total_margin NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(pf.contracted_revenue), 0),
    COALESCE(SUM(calculate_labor_cost(p.id)), 0),
    COALESCE(SUM(calculate_tax(p.id)), 0),
    COALESCE(SUM(pf.indirect_cost), 0),
    COALESCE(SUM(calculate_result(p.id)), 0),
    CASE
      WHEN SUM(pf.contracted_revenue) = 0 THEN 0
      ELSE (SUM(calculate_result(p.id)) / SUM(pf.contracted_revenue)) * 100
    END
  FROM projects p
  LEFT JOIN project_financials pf ON p.id = pf.project_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
