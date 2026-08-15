import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      // Always show success message — don't reveal if email exists
      setSuccess(true);
    } catch (err) {
      // Don't reveal if email exists — show generic success
      // Only show error for network issues
      if (err instanceof Error && err.message.includes('network')) {
        setError('Erro de conexão. Verifique sua internet e tente novamente.');
      } else {
        setSuccess(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-focon-950 via-teal-950 to-focon-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-teal-600 to-cyan-600 rounded-3xl blur opacity-20"></div>
          <div className="relative bg-gradient-to-br from-focon-900/40 to-focon-950/40 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/10">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-teal-400 via-teal-500 to-cyan-600 rounded-2xl shadow-2xl mb-4">
                <img src="/brand/focon-colorida.jpeg" alt="Fócon Engenharia" className="h-16 w-16 object-contain" />
              </div>
              <h1 className="text-3xl font-black text-white mb-2">Recuperar Senha</h1>
              <p className="text-teal-200/80 text-sm">
                Informe seu e-mail para receber o link de recuperação
              </p>
            </div>

            {success ? (
              <div className="space-y-6">
                <div className="rounded-xl bg-green-500/20 border border-green-400/50 p-4 backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <div className="text-green-400 mt-0.5">✓</div>
                    <div>
                      <p className="text-sm font-medium text-green-100">
                        Se o e-mail existir em nosso sistema, você receberá um link de recuperação em instantes.
                      </p>
                      <p className="text-xs text-green-200/70 mt-2">
                        Verifique sua caixa de entrada e a pasta de spam.
                      </p>
                    </div>
                  </div>
                </div>
                <Link
                  to="/login"
                  className="block w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold rounded-xl transition text-center"
                >
                  Voltar para Login
                </Link>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="rounded-xl bg-red-500/20 border border-red-400/50 p-4 backdrop-blur-sm">
                    <p className="text-sm font-medium text-red-100">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-white mb-2.5">
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400/50 transition"
                    placeholder="seu@email.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
                >
                  {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
                </button>

                <div className="text-center">
                  <Link to="/login" className="text-sm text-teal-300 hover:text-teal-200 transition">
                    ← Voltar para Login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
