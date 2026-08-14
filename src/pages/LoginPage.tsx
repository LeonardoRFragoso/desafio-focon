import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@/schemas/auth';
import { useAuthContext } from '@/features/auth/useAuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error, user, profile } = useAuthContext();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  // Redirect based on role when user and profile are loaded
  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.role === 'admin') {
        navigate('/dashboard');
      } else {
        navigate('/time-entries');
      }
    }
  }, [user, profile, loading, navigate]);

  const onSubmit = async (data: LoginInput) => {
    try {
      setSubmitError(null);
      await login(data.email, data.password);
      // Redirection is handled by useEffect above
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha no login. Tente novamente.';
      setSubmitError(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-focon-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Main card container */}
        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
          {/* Header */}
          <div className="text-center">
            {/* Logo container */}
            <div className="inline-flex items-center justify-center w-20 h-20 bg-focon-100 rounded-xl mb-6">
              <img
                src="/brand/focon-colorida.jpeg"
                alt="Focon Engenharia"
                className="h-16 w-16 object-contain"
              />
            </div>

            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              FoconFlow
            </h1>
            <p className="text-slate-600 text-sm font-medium">
              Controle de Produção e Rentabilidade
            </p>
          </div>

          {/* Form */}
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {(submitError || error) && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 animate-shake">
                <p className="text-sm font-medium text-red-800">
                  {submitError || error?.message}
                </p>
              </div>
            )}

            <div className="space-y-5">
              {/* Email field */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                  E-mail
                </label>
                <input
                  {...register('email')}
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
                  placeholder="seu@email.com"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                  Senha
                </label>
                <input
                  {...register('password')}
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
                  placeholder="••••••••"
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                )}
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-focon-600 hover:bg-focon-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focon-600"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-slate-400 text-xs">
          <p>© 2026 FoconFlow. Desenvolvido para a Fócon Engenharia.</p>
        </div>
      </div>
    </div>
  );
}
