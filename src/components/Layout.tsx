import { type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/useAuthContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white transform transition-transform duration-300 z-50 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-slate-800">
          <img
            src="/brand/focon-logo-white.png"
            alt="Fócon Engenharia"
            className="h-8 object-contain"
          />
          <h1 className="mt-4 text-xl font-bold">FoconFlow</h1>
        </div>

        <nav className="p-6 space-y-2">
          {isAdmin ? (
            <>
              <a
                href="/dashboard"
                className="block px-4 py-2 rounded-lg hover:bg-slate-800 transition"
              >
                Painel Administrativo
              </a>
              <a
                href="/report"
                className="block px-4 py-2 rounded-lg hover:bg-slate-800 transition"
              >
                Relatório
              </a>
            </>
          ) : (
            <a
              href="/time-entries"
              className="block px-4 py-2 rounded-lg hover:bg-slate-800 transition"
            >
              Meus Apontamentos
            </a>
          )}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-slate-800">
          <p className="text-sm text-slate-400 mb-4">
            {user?.email}
          </p>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-sm font-medium"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="md:ml-64">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition"
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
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
