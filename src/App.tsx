import { AuthProvider } from '@/features/auth/AuthContextProvider';
import { AppRoutes } from '@/routes';
import { initSentry } from '@/lib/sentry-init';
import { SentryErrorBoundary } from '@/lib/sentry';
import { PWAUpdatePrompt } from '@/components/PWAUpdatePrompt';
import { ThemeProvider } from '@/features/theme/ThemeProvider';

// Initialize Sentry (no-op if DSN not configured)
initSentry();

function App() {
  return (
    <SentryErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <PWAUpdatePrompt />
        </AuthProvider>
      </ThemeProvider>
    </SentryErrorBoundary>
  );
}

export default App;
