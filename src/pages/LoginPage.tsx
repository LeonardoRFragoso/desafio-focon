import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@/schemas/auth';
import { useAuthContext } from '@/features/auth/useAuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuthContext();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      setSubmitError(null);
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha no login. Tente novamente.';
      setSubmitError(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <img
            src="/brand/focon-colorida.jpeg"
            alt="Fócon Engenharia"
            className="h-16 w-16 mx-auto object-contain"
          />
          <h1 className="mt-6 text-3xl font-bold text-slate-900">
            FoconFlow
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Controle de Produção e Rentabilidade
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {(submitError || error) && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm font-medium text-red-800">
                {submitError || error?.message}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                E-mail
              </label>
              <input
                {...register('email')}
                id="email"
                type="email"
                autoComplete="email"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                placeholder="seu@email.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Senha
              </label>
              <input
                {...register('password')}
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Desenvolvido para Fócon Engenharia
        </p>
      </div>
    </div>
  );
}
