import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/useAuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'member';
}

/**
 * ProtectedRoute validates user authentication and authorization.
 *
 * Authorization rules:
 * - Not authenticated → /login
 * - No profile → /login (profile must exist in database)
 * - Admin required but user is member → /access-denied
 * - Member required but user is admin → allowed (admins can access member pages)
 *
 * Routes:
 * - /dashboard (admin only)
 * - /report (admin only)
 * - /time-entries (member, but admins can also access)
 * - /login (public)
 * - /access-denied (public)
 */
export function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-canvas">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-focon-600"></div>
          <p className="mt-4 text-app-muted">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <Navigate to="/access-denied" replace />;
  }

  if (requiredRole === 'admin' && profile.role !== 'admin') {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}
