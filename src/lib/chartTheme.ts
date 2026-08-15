/**
 * Centralized chart color palette for Recharts.
 *
 * All charts in the application derive their colors from this module to keep
 * the visual identity consistent with the Fócon brand and the semantic design
 * tokens. The palette avoids generic navy/blue dominance in dark mode and
 * uses Fócon teal as the primary series color.
 *
 * Series colors are theme-independent (they need to be distinguishable on both
 * light and dark backgrounds). Axis, grid, and tooltip colors are theme-aware
 * and match the semantic token values.
 */

/** Fócon brand teal — primary series color. */
export const FOCON_TEAL = '#14898b';
/** Lighter Fócon teal — secondary series. */
export const FOCON_TEAL_LIGHT = '#38a2a4';
/** Fócon teal dark — used in light mode for primary series when more contrast is needed. */
export const FOCON_TEAL_DARK = '#007678';

/**
 * Categorical color palette for pie/bar charts with multiple series.
 * Ordered: Fócon teal → emerald → amber → red → purple → pink → cyan → orange.
 * Avoids using five near-identical green tones when series need to be compared.
 */
export const CHART_COLORS = [
  FOCON_TEAL, // primary — Fócon teal
  '#10b981', // emerald-500
  '#f59e0b', // amber-500 (warning)
  '#ef4444', // red-500 (danger)
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
] as const;

/** Semantic series colors for known data categories. */
export const SERIES_COLORS = {
  primary: FOCON_TEAL,
  secondary: FOCON_TEAL_LIGHT,
  planned: '#3b82f6', // blue-500 (info/planned)
  actual: FOCON_TEAL, // Fócon teal
  warning: '#f59e0b', // amber-500
  danger: '#ef4444', // red-500
  success: '#10b981', // emerald-500
} as const;

export interface ChartTheme {
  axisColor: string;
  gridColor: string;
  tooltipBackgroundColor: string;
  tooltipBorderColor: string;
  tooltipTextColor: string;
  legendColor: string;
}

/**
 * Returns theme-aware chart styling (axis, grid, tooltip, legend) for Recharts.
 * Colors match the semantic design tokens in index.css.
 */
export function getChartTheme(isDark: boolean): ChartTheme {
  if (isDark) {
    return {
      axisColor: '#9fb5b2', // --text-muted (dark)
      gridColor: '#1e3a36', // --border-primary (dark)
      tooltipBackgroundColor: '#10211f', // --surface-elevated (dark)
      tooltipBorderColor: '#285048', // --border-strong (dark)
      tooltipTextColor: '#f5f7f7', // --text-primary (dark)
      legendColor: '#c4d4d2', // --text-secondary (dark)
    };
  }
  return {
    axisColor: '#475569', // --text-secondary (light)
    gridColor: '#cbd5e1', // --border-strong (light)
    tooltipBackgroundColor: '#ffffff', // --surface-primary (light)
    tooltipBorderColor: '#e2e8f0', // --border-primary (light)
    tooltipTextColor: '#0f172a', // --text-primary (light)
    legendColor: '#475569', // --text-secondary (light)
  };
}

/** Returns the tooltip style object for Recharts Tooltip component. */
export function getChartTooltipStyle(isDark: boolean): React.CSSProperties {
  const theme = getChartTheme(isDark);
  return {
    backgroundColor: theme.tooltipBackgroundColor,
    border: `1px solid ${theme.tooltipBorderColor}`,
    borderRadius: '0.5rem',
    color: theme.tooltipTextColor,
  };
}
