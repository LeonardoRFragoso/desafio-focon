import { type ReactNode, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/useAuthContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuthContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-focon-950 text-white transform transition-transform duration-300 z-50 md:translate-x-0 md:sticky md:top-0 md:shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-focon-900">
          <img
            src="/brand/focon-logo-white.png"
            alt="Fócon Engenharia"
            className="h-8 object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold text-white">FoconFlow</h1>
        </div>

        <nav className="p-6 space-y-2">
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
            </>
          ) : (
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
          )}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-focon-900">
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
        <header className="bg-white border-b border-slate-200 border-t-4 border-t-focon-600 sticky top-0 z-40 print:hidden">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition"
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
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">
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
    </div>
  );
}
