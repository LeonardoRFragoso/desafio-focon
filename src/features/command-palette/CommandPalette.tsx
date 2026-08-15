import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { commandCenterAPI } from '@/lib/supabase/api';
import type { GlobalSearchResults, SearchResult } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';

interface CommandItem {
  type: 'command';
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  href: string;
  action?: () => void;
}

type PaletteItem = SearchResult | CommandItem;

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const ADMIN_COMMANDS: Omit<CommandItem, 'action'>[] = [
  { type: 'command', id: 'cmd-new-project', title: 'Novo Projeto', subtitle: 'Ir para Projetos', icon: '📁', href: '/admin/projects' },
  { type: 'command', id: 'cmd-approvals', title: 'Ir para Aprovações', subtitle: 'Aprovar apontamentos', icon: '✅', href: '/admin/time-entries?status=pending' },
  { type: 'command', id: 'cmd-history', title: 'Histórico de Apontamentos', subtitle: 'Ver todos apontamentos', icon: '📋', href: '/admin/time-entries' },
  { type: 'command', id: 'cmd-projects', title: 'Projetos', subtitle: 'Gerenciar projetos', icon: '🏗️', href: '/admin/projects' },
  { type: 'command', id: 'cmd-projects-unassigned', title: 'Projetos sem Equipe', subtitle: 'Alocar equipe', icon: '👥', href: '/admin/projects?team=unassigned' },
  { type: 'command', id: 'cmd-professionals', title: 'Profissionais', subtitle: 'Gerenciar equipe', icon: '�', href: '/admin/professionals' },
  { type: 'command', id: 'cmd-hourly-rates', title: 'Valores/Hora', subtitle: 'Configurar taxas', icon: '💵', href: '/admin/hourly-rates' },
  { type: 'command', id: 'cmd-financial', title: 'Financeiro', subtitle: 'Gestão financeira', icon: '💰', href: '/admin/financial' },
  { type: 'command', id: 'cmd-budget', title: 'Orçamento', subtitle: 'Orçamento × Realizado', icon: '📊', href: '/admin/budget' },
  { type: 'command', id: 'cmd-capacity', title: 'Capacidade', subtitle: 'Planejamento de capacidade', icon: '📈', href: '/admin/capacity' },
  { type: 'command', id: 'cmd-charts', title: 'Gráficos', subtitle: 'Visualizações', icon: '📈', href: '/admin/charts' },
  { type: 'command', id: 'cmd-alerts', title: 'Alertas', subtitle: 'Alertas de rentabilidade', icon: '🚨', href: '/admin/alerts' },
  { type: 'command', id: 'cmd-periods', title: 'Períodos', subtitle: 'Fechamento de períodos', icon: '📅', href: '/admin/periods' },
  { type: 'command', id: 'cmd-audit', title: 'Auditoria', subtitle: 'Logs de auditoria', icon: '🔍', href: '/admin/audit' },
  { type: 'command', id: 'cmd-system-status', title: 'Status do Sistema', subtitle: 'Health check', icon: '🩺', href: '/admin/system-status' },
];

const PROFESSIONAL_COMMANDS: Omit<CommandItem, 'action'>[] = [
  { type: 'command', id: 'cmd-my-entries', title: 'Meus Apontamentos', subtitle: 'Ver histórico', icon: '📋', href: '/time-entries' },
  { type: 'command', id: 'cmd-calendar', title: 'Calendário', subtitle: 'Calendário semanal', icon: '📅', href: '/time-entries/calendar' },
  { type: 'command', id: 'cmd-recurring', title: 'Regras Recorrentes', subtitle: 'Configurar apontamentos', icon: '🔁', href: '/recurring' },
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuthContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');
       
      setResults(null);
       
      setSelectedIndex(0);
       
      setError(null);
      // Focus input after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
       
      setLoading(false);
      return;
    }

     
    setLoading(true);
     
    setError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error: rpcError } = await commandCenterAPI.searchGlobal(query.trim(), 8);
        if (rpcError) throw new Error(mapDatabaseError(rpcError));
        setResults(data as unknown as GlobalSearchResults);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro na busca');
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // Build the flat list of items for keyboard navigation
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];

    // Add commands (filtered by query)
    const commands = isAdmin ? ADMIN_COMMANDS : PROFESSIONAL_COMMANDS;
    const lowerQuery = query.trim().toLowerCase();
    const filteredCommands = lowerQuery.length === 0
      ? commands
      : commands.filter(c =>
          c.title.toLowerCase().includes(lowerQuery) ||
          c.subtitle.toLowerCase().includes(lowerQuery)
        );

    // Add action commands for professional (deep link navigation)
    if (!isAdmin) {
      filteredCommands.unshift({
        type: 'command' as const, id: 'cmd-quick-entry', title: 'Novo Apontamento',
        subtitle: 'Criar apontamento rápido', icon: '⚡', href: '/my-dashboard?action=quick-entry',
      });
      filteredCommands.unshift({
        type: 'command' as const, id: 'cmd-timer', title: 'Iniciar Timer',
        subtitle: 'Começar contagem de tempo', icon: '⏱️', href: '/my-dashboard?action=start-timer',
      });
    }

    items.push(...filteredCommands.map(c => ({ ...c, type: 'command' as const })));

    // Add search results
    if (results) {
      items.push(...results.projects);
      items.push(...results.tasks);
      items.push(...results.professionals);
      items.push(...results.time_entries);
    }

    return items;
  }, [query, results, isAdmin]);

  // Reset selected index when items change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [allItems.length]);

  const executeItem = useCallback((item: PaletteItem) => {
    if (item.type === 'command') {
      const cmd = item as CommandItem;
      navigate(cmd.href);
    } else {
      const result = item as SearchResult;
      navigate(result.href);
    }
    onClose();
  }, [navigate, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        executeItem(allItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [allItems, selectedIndex, executeItem, onClose]);

  // Global Escape handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const hasResults = results && (
    results.projects.length > 0 ||
    results.tasks.length > 0 ||
    results.professionals.length > 0 ||
    results.time_entries.length > 0
  );

  const showNoResults = query.trim().length >= 2 && !loading && !hasResults && !error;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl bg-surface-primary rounded-xl shadow-2xl border border-app-primary overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-app-primary">
          <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no FoconFlow..."
            className="flex-1 bg-transparent text-app-primary placeholder-slate-400 outline-none text-lg"
            aria-label="Buscar"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <div className="w-5 h-5 border-2 border-app-strong border-t-focon-600 rounded-full animate-spin shrink-0" />
          )}
          <kbd className="hidden sm:inline-block px-2 py-1 text-xs text-slate-400 bg-surface-secondary rounded border border-app-primary shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {showNoResults && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-app-muted">
                Nenhum resultado para "{query.trim()}"
              </p>
            </div>
          )}

          {!loading && query.trim().length < 2 && !error && (
            <div className="px-4 py-3 text-xs text-app-muted">
              Digite pelo menos 2 caracteres para buscar
            </div>
          )}

          {allItems.length > 0 && (
            <ul role="listbox" aria-label="Resultados da busca">
              {allItems.map((item, index) => {
                const isCommand = item.type === 'command';
                const cmd = isCommand ? (item as CommandItem) : null;
                const result = !isCommand ? (item as SearchResult) : null;
                const isSelected = index === selectedIndex;

                return (
                  <li
                    key={`${item.type}-${item.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => executeItem(item)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${
                      isSelected
                        ? 'bg-focon-50 dark:bg-focon-900/30'
                        : 'hover:bg-hover-surface'
                    }`}
                  >
                    <span className="text-xl shrink-0">
                      {cmd?.icon ?? (item.type === 'project' ? '📁' : item.type === 'task' ? '✅' : item.type === 'professional' ? '👤' : '📋')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-app-primary truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-app-muted truncate">
                        {item.subtitle}
                      </p>
                    </div>
                    {cmd && (
                      <span className="text-xs text-slate-400 shrink-0">Comando</span>
                    )}
                    {result && (
                      <span className="text-xs text-slate-400 capitalize shrink-0">
                        {result.type === 'time_entry' ? 'Apontamento' : result.type === 'project' ? 'Projeto' : result.type === 'task' ? 'Tarefa' : 'Profissional'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-app-primary flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-secondary rounded border border-app-primary">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-secondary rounded border border-app-primary">↵</kbd>
              selecionar
            </span>
          </div>
          <span>FoconFlow</span>
        </div>
      </div>
    </div>
  );
}
