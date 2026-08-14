import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/useAuthContext';

export function RootPage() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuthContext();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (profile?.role === 'admin') {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/time-entries', { replace: true });
    }
  }, [user, profile, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white/60">Carregando...</p>
      </div>
    </div>
  );
}
