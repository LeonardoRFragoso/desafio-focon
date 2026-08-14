import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check for recovery session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setSessionReady(true);
        } else {
          // Listen for the recovery event
          supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session) {
              setSessionReady(true);
            }
          });
        }
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número.');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar senha. O link pode ter expirado.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-400 mx-auto mb-4"></div>
          <p className="text-teal-200/80 text-sm">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 py-12 px-4">
        <div className="max-w-md w-full">
          <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/10 text-center">
            <div className="text-yellow-400 text-4xl mb-4">⚠</div>
            <h1 className="text-2xl font-bold text-white mb-2">Link inválido ou expirado</h1>
            <p className="text-teal-200/80 text-sm mb-6">
              O link de recuperação pode ter expirado. Solicite um novo link.
            </p>
            <a
              href="/forgot-password"
              className="inline-block px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold rounded-xl transition"
            >
              Solicitar Novo Link
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-teal-600 to-cyan-600 rounded-3xl blur opacity-20"></div>
          <div className="relative bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/10">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-black text-white mb-2">Nova Senha</h1>
              <p className="text-teal-200/80 text-sm">Defina sua nova senha de acesso</p>
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/20 border border-red-400/50 p-4 backdrop-blur-sm mb-6">
                <p className="text-sm font-medium text-red-100">{error}</p>
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-white mb-2.5">
                  Nova Senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400/50 transition"
                  placeholder="••••••••"
                  minLength={8}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-white mb-2.5">
                  Confirmar Senha
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400/50 transition"
                  placeholder="••••••••"
                  minLength={8}
                />
              </div>

              <div className="text-xs text-teal-200/60 space-y-1">
                <p>A senha deve conter:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Mínimo de 8 caracteres</li>
                  <li>Pelo menos uma letra maiúscula</li>
                  <li>Pelo menos uma letra minúscula</li>
                  <li>Pelo menos um número</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
              >
                {loading ? 'Atualizando...' : 'Atualizar Senha'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
