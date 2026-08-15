/**
 * Theme system — single source of truth for the Clean (light) / Dark themes.
 *
 * Storage key: `foconflow-theme` (kept stable for existing users).
 * Values: `light` | `dark`.
 *
 * Default on first access (no stored value): `light` (Clean).
 * The OS `prefers-color-scheme` is intentionally NOT consulted so the
 * application fully owns the visual state — see index.css `@custom-variant`.
 */

export const THEME_STORAGE_KEY = 'foconflow-theme';
export type Theme = 'light' | 'dark';

export const VALID_THEMES: readonly Theme[] = ['light', 'dark'] as const;

/**
 * Read the persisted theme without throwing. Returns `null` when no valid
 * preference is stored so callers can apply the default explicitly.
 */
export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the effective theme. First access defaults to `light` (Clean).
 */
export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? 'light';
}

/**
 * Apply the theme to the document root. Idempotent and safe to call before
 * React mounts (also used by the no-flash inline script in index.html).
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

/**
 * Persist the theme preference. Silently ignores storage failures (e.g.
 * private mode quota errors).
 */
export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}
