import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, screen, act, fireEvent } from '@testing-library/react';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './ThemeContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  THEME_STORAGE_KEY,
  readStoredTheme,
  resolveInitialTheme,
  applyTheme,
  persistTheme,
  isTheme,
} from './theme';

function harness() {
  const useThemeResult = renderHook(() => useTheme(), { wrapper: ThemeProvider });
  return useThemeResult;
}

describe('theme utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  describe('readStoredTheme', () => {
    it('returns null when no preference stored', () => {
      expect(readStoredTheme()).toBeNull();
    });

    it('returns "light" when stored', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      expect(readStoredTheme()).toBe('light');
    });

    it('returns "dark" when stored', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(readStoredTheme()).toBe('dark');
    });

    it('returns null for invalid values', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'system');
      expect(readStoredTheme()).toBeNull();
    });

    it('returns null when localStorage throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied');
      });
      expect(readStoredTheme()).toBeNull();
      spy.mockRestore();
    });
  });

  describe('resolveInitialTheme', () => {
    it('defaults to light on first access (no stored value)', () => {
      expect(resolveInitialTheme()).toBe('light');
    });

    it('respects stored dark preference', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(resolveInitialTheme()).toBe('dark');
    });

    it('respects stored light preference', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      expect(resolveInitialTheme()).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('adds .dark class and sets color-scheme for dark', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('removes .dark class and sets color-scheme for light', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('is idempotent', () => {
      applyTheme('dark');
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('persistTheme', () => {
    it('writes the theme to localStorage', () => {
      persistTheme('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('does not throw when localStorage is unavailable', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('denied');
      });
      expect(() => persistTheme('light')).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('isTheme', () => {
    it('validates light and dark', () => {
      expect(isTheme('light')).toBe(true);
      expect(isTheme('dark')).toBe(true);
    });

    it('rejects invalid values', () => {
      expect(isTheme('system')).toBe(false);
      expect(isTheme(null)).toBe(false);
      expect(isTheme(undefined)).toBe(false);
      expect(isTheme(123)).toBe(false);
    });
  });
});

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('defaults to light when no preference is stored', () => {
    const { result } = harness();
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('initializes to dark from a stored dark preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    document.documentElement.classList.add('dark'); // simulate inline script
    const { result } = harness();
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('initializes to light from a stored light preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { result } = harness();
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggleTheme switches light -> dark and updates the html class + storage', () => {
    const { result } = harness();
    expect(result.current.theme).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('toggleTheme switches dark -> light', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    document.documentElement.classList.add('dark');
    const { result } = harness();
    expect(result.current.theme).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('setTheme updates the html class and persists', () => {
    const { result } = harness();
    act(() => {
      result.current.setTheme('dark');
    });
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('throws when useTheme is used outside the provider', () => {
    // Suppress the expected console.error from React for the thrown error.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeProvider');
    spy.mockRestore();
  });

  it('preserves preference across remounts (storage is the source of truth)', () => {
    const { result, unmount } = harness();
    act(() => {
      result.current.setTheme('dark');
    });
    unmount();

    // Simulate reload: inline script applies stored theme to <html>
    document.documentElement.classList.add('dark');
    const { result: result2 } = harness();
    expect(result2.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('renders an accessible button reflecting the current theme', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    const button = screen.getByRole('button');
    // Default is light, so the label should offer "ativar tema escuro"
    expect(button).toHaveAttribute('aria-label', 'Ativar tema escuro');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles the theme on click and updates aria state', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', 'Ativar tema claro');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
