import { AuthProvider } from '@/features/auth/AuthContextProvider';
import { AppRoutes } from '@/routes';
import { initSentry } from '@/lib/sentry-init';
import { SentryErrorBoundary } from '@/lib/sentry';
import { PWAUpdatePrompt } from '@/components/PWAUpdatePrompt';

// Initialize Sentry (no-op if DSN not configured)
initSentry();

function App() {
  return (
    <SentryErrorBoundary>
      <AuthProvider>
        <AppRoutes />
        <PWAUpdatePrompt />
      </AuthProvider>
    </SentryErrorBoundary>
  );
}

export default App;
