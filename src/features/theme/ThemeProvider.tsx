import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext, type ThemeContextValue } from './ThemeContext';
import {
  applyTheme,
  persistTheme,
  resolveInitialTheme,
  type Theme,
} from './theme';

interface ThemeProviderProps {
  children: ReactNode;
  /** Override the initial theme (mainly for tests). */
  initialTheme?: Theme;
}

/**
 * Centralized theme controller.
 *
 * - Holds the single source of truth for `theme` / `setTheme` / `toggleTheme`.
 * - Keeps the `.dark` class on <html> in sync with the state.
 * - Persists the preference to localStorage (`foconflow-theme`).
 *
 * The no-flash inline script in index.html applies the stored theme before
 * React mounts, so the state here is initialized from the DOM to stay in sync
 * and avoid a redundant paint.
 */
export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (initialTheme) return initialTheme;
    // The inline script in index.html already applied the class; derive the
    // initial React state from the DOM so they never diverge.
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return resolveInitialTheme();
  });

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      persistTheme(next);
      return next;
    });
  }, []);

  // Keep the DOM in sync if the state was initialized from `initialTheme`
  // (e.g. tests) and differs from the inline-script-applied class.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Reflect preference changes from other tabs/windows.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'foconflow-theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
        applyTheme(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
