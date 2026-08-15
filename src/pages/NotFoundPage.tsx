import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-canvas py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-6xl font-bold text-app-primary">404</h1>
          <p className="mt-2 text-xl text-app-muted">Página não encontrada</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-focon-600 hover:bg-focon-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focon-500 dark:ring-offset-slate-950"
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
