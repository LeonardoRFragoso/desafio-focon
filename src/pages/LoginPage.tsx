import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
        navigate('/my-dashboard');
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-400 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-teal-400 rounded-full mix-blend-screen filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        {/* Main card container with enhanced styling */}
        <div className="group relative">
          {/* Glow effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-teal-600 to-cyan-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
          
          {/* Card */}
          <div className="relative bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/10 group-hover:border-white/20 transition">
            {/* Header with enhanced styling */}
            <div className="text-center mb-8">
              {/* Logo container with glow */}
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-teal-400 via-teal-500 to-cyan-600 rounded-2xl shadow-2xl mb-6 transform hover:scale-110 transition duration-300 relative group/logo">
                <div className="absolute inset-0 bg-gradient-to-br from-teal-300 to-cyan-400 rounded-2xl blur opacity-0 group-hover/logo:opacity-50 transition duration-300"></div>
                <img
                  src="/brand/focon-colorida.jpeg"
                  alt="Fócon Engenharia"
                  className="h-20 w-20 object-contain relative z-10"
                />
              </div>
              
              <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-teal-100 to-cyan-100 mb-2">
                FoconFlow
              </h1>
              <p className="text-teal-200/80 text-sm font-medium tracking-wide">
                Controle de Produção e Rentabilidade
              </p>
            </div>

            {/* Form with enhanced styling */}
            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
              {(submitError || error) && (
                <div className="rounded-xl bg-red-500/20 border border-red-400/50 p-4 backdrop-blur-sm animate-shake">
                  <div className="flex items-start gap-3">
                    <div className="text-red-400 mt-0.5">⚠</div>
                    <p className="text-sm font-medium text-red-100">
                      {submitError || error?.message}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {/* Email field */}
                <div className="group/field">
                  <label htmlFor="email" className="block text-sm font-semibold text-white mb-2.5 flex items-center gap-2">
                    <span className="text-teal-400">✉</span>
                    E-mail
                  </label>
                  <div className="relative">
                    <input
                      {...register('email')}
                      id="email"
                      type="email"
                      autoComplete="email"
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400/50 transition backdrop-blur-sm group-hover/field:bg-white/10 group-hover/field:border-white/20"
                      placeholder="seu@email.com"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400/0 group-focus-within/field:text-teal-400 transition">→</div>
                  </div>
                  {errors.email && (
                    <p className="mt-2 text-sm text-red-300 flex items-center gap-1">
                      <span>✕</span> {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password field */}
                <div className="group/field">
                  <label htmlFor="password" className="block text-sm font-semibold text-white mb-2.5 flex items-center gap-2">
                    <span className="text-teal-400">🔒</span>
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      {...register('password')}
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400/50 transition backdrop-blur-sm group-hover/field:bg-white/10 group-hover/field:border-white/20"
                      placeholder="••••••••"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400/0 group-focus-within/field:text-teal-400 transition">→</div>
                  </div>
                  {errors.password && (
                    <p className="mt-2 text-sm text-red-300 flex items-center gap-1">
                      <span>✕</span> {errors.password.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Forgot password link */}
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm text-teal-300 hover:text-teal-200 transition"
                >
                  Esqueci minha senha
                </Link>
              </div>

              {/* Submit button with enhanced styling */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold rounded-xl transition transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-xl hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-400 focus:ring-offset-slate-950 relative overflow-hidden group/btn"
              >
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/btn:opacity-100 transition"></div>
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Entrando...
                    </>
                  ) : (
                    <>
                      Entrar
                      <span className="group-hover/btn:translate-x-1 transition">→</span>
                    </>
                  )}
                </span>
              </button>
            </form>
          </div>
        </div>

        {/* Enhanced footer */}
        <div className="text-center space-y-2">
          <p className="text-white/50 text-xs font-medium">
            Desenvolvido para Fócon Engenharia
          </p>
          <p className="text-white/30 text-xs">
            © 2026 FoconFlow. Todos os direitos reservados.
          </p>
          <div className="flex items-center justify-center gap-1 text-white/20 text-xs mt-3">
            <span className="w-1 h-1 bg-teal-400 rounded-full"></span>
            <span>Seguro e confiável</span>
            <span className="w-1 h-1 bg-teal-400 rounded-full"></span>
          </div>
        </div>
      </div>
    </div>
  );
}
