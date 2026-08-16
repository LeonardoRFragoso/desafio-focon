/**
 * Sanitize a user-provided search term for safe interpolation into a
 * PostgREST filter string (e.g. the argument to supabase-js `.or()`).
 *
 * PostgREST filter syntax uses these characters as structural delimiters:
 *   ,  — separates conditions inside or(...) / and(...)
 *   .  — separates column.operator.value
 *   (  — opens a nested group
 *   )  — closes a nested group
 *   \\ — escape character
 *
 * If a user search term contains any of these, it can break out of the
 * intended filter value and inject additional filter conditions (filter
 * injection). While RLS still prevents unauthorized data access, filter
 * injection can cause unexpected query behavior, error-based schema
 * leakage, and enumeration attacks.
 *
 * This helper escapes every structural character so the search term is
 * treated as a literal value by the PostgREST parser.
 *
 * @example
 *   // WITHOUT sanitization (vulnerable):
 *   query.or(`description.ilike.%${search}%,project.name.ilike.%${search}%`);
 *   // If search = "foo,description.eq.bar", this injects an extra condition.
 *
 *   // WITH sanitization (safe):
 *   const s = sanitizePostgrestValue(search);
 *   query.or(`description.ilike.%${s}%,project.name.ilike.%${s}%`);
 */
export function sanitizePostgrestValue(value: string): string {
  // Order matters: escape backslash first to avoid double-escaping.
  // PostgREST uses \\ as the escape character.
  return value
    .replace(/\\/g, '\\\\') // \\ → \\\\ (escape backslash first)
    .replace(/,/g, '\\,') // , → \\,
    .replace(/\./g, '\\.') // . → \\.
    .replace(/\(/g, '\\(') // ( → \\(
    .replace(/\)/g, '\\)'); // ) → \\)
}

/**
 * Build a safe PostgREST `or` filter string for an ILIKE search across
 * multiple columns. Each column is searched for the sanitized term
 * surrounded by `%` wildcards.
 *
 * @example
 *   const filter = buildIlikeOrFilter('john', ['description', 'project.name']);
 *   // → "description.ilike.%john%,project.name.ilike.%john%"
 *   query = query.or(filter);
 */
export function buildIlikeOrFilter(searchTerm: string, columns: string[]): string {
  const sanitized = sanitizePostgrestValue(searchTerm);
  return columns.map((col) => `${col}.ilike.%${sanitized}%`).join(',');
}
