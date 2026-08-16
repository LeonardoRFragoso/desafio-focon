import { type ReactNode, useState, useEffect, useCallback } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { NotificationBell } from '@/components/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CommandPalette } from '@/features/command-palette/CommandPalette';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuthContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl/Cmd+K to open command palette
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setPaletteOpen(prev => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-app-canvas md:flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-[55] md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-focon-950 text-white flex flex-col transform transition-transform duration-300 z-[60] md:translate-x-0 md:sticky md:top-0 md:shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="shrink-0 p-6 border-b border-focon-900">
          <img
            src="/brand/focon-logo-white.png"
            alt="Fócon Engenharia"
            className="h-8 object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold text-white">FoconFlow</h1>
        </div>

        <nav
          className="flex-1 min-h-0 p-6 space-y-2 overflow-y-auto sidebar-scrollbar"
          aria-label="Navegação principal"
        >
          {isAdmin ? (
            <>
              <NavLink
                to="/dashboard"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Painel Administrativo
              </NavLink>
              <NavLink
                to="/report"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Relatório
              </NavLink>
              <NavLink
                to="/admin/projects"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Projetos
              </NavLink>
              <NavLink
                to="/admin/professionals"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Profissionais
              </NavLink>
              <NavLink
                to="/admin/hourly-rates"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Valor/Hora
              </NavLink>
              <NavLink
                to="/admin/financial"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Financeiro
              </NavLink>
              <NavLink
                to="/admin/periods"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Fechamentos
              </NavLink>
              <NavLink
                to="/admin/audit"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Auditoria
              </NavLink>
              <NavLink
                to="/admin/time-entries"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Histórico de Apontamentos
              </NavLink>
              <NavLink
                to="/admin/budget"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Orçamento × Realizado
              </NavLink>
              <NavLink
                to="/admin/charts"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Gráficos
              </NavLink>
              <NavLink
                to="/admin/alerts"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Alertas
              </NavLink>
              <NavLink
                to="/admin/system-status"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Status do Sistema
              </NavLink>
              <NavLink
                to="/admin/capacity"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Capacidade
              </NavLink>
              <NavLink
                to="/admin/project-health"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Saúde dos Projetos
              </NavLink>
            </>
          ) : (
            <>
              <NavLink
                to="/my-dashboard"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Meu Painel
              </NavLink>
              <NavLink
                to="/time-entries"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Meus Apontamentos
              </NavLink>
              <NavLink
                to="/time-entries/calendar"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Calendário Semanal
              </NavLink>
              {/* Meta Semanal — deep-link action to /my-dashboard?action=define-goal.
                  Uses a button + navigate instead of NavLink to avoid double-active
                  state with "Meu Painel" (same pathname, different action param). */}
              <button
                onClick={() => {
                  closeSidebar();
                  navigate('/my-dashboard?action=define-goal');
                }}
                className="block w-full text-left px-4 py-3 rounded-lg font-medium transition text-slate-300 hover:bg-focon-800"
              >
                Meta Semanal
              </button>
              <NavLink
                to="/recurring"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg font-medium transition ${
                    isActive
                      ? 'bg-focon-600 text-white'
                      : 'text-slate-300 hover:bg-focon-800'
                  }`
                }
              >
                Regras Recorrentes
              </NavLink>
            </>
          )}
        </nav>

        <div className="shrink-0 p-6 border-t border-focon-900">
          <p className="text-sm text-slate-400 mb-4 truncate">
            {user?.email}
          </p>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2.5 bg-focon-600 hover:bg-focon-700 rounded-lg transition text-sm font-medium"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="min-w-0 flex-1">
        {/* Header */}
        <header className="bg-surface-primary border-b border-app-primary border-t-4 border-t-focon-600 border-app-primary sticky top-0 z-30 print:hidden">
          <div className="flex items-center px-4 py-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 text-app-secondary hover:bg-hover-surface rounded-lg transition"
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={() => setPaletteOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-app-muted bg-surface-secondary hover:bg-hover-surface rounded-lg transition"
                aria-label="Buscar (Ctrl+K)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="hidden sm:inline">Buscar</span>
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs bg-surface-elevated rounded">⌘K</kbd>
              </button>
              <NotificationBell />
              <ThemeToggle />
              <span className="text-sm text-app-secondary">
                {isAdmin ? 'Administrador' : 'Profissional'}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="w-full max-w-[1600px] mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {/* Command Palette (Ctrl/Cmd+K) */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
