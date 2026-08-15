import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { RootPage } from '@/pages/RootPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TimeEntriesPage } from '@/pages/TimeEntriesPage';
import { ReportPage } from '@/pages/ReportPage';
import { ProfessionalDashboardPage } from '@/pages/ProfessionalDashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AccessDeniedPage } from '@/pages/AccessDeniedPage';
import { RecurringRulesPage } from '@/pages/RecurringRulesPage';
import { WeeklyCalendarPage } from '@/pages/WeeklyCalendarPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { ProtectedRoute } from './ProtectedRoute';

// ---------------------------------------------------------------------------
// Route-level code splitting: admin pages are lazy-loaded so they don't
// bloat the initial bundle for member users (who never visit admin routes).
// The member-facing pages above stay eager for fast first paint.
// ---------------------------------------------------------------------------
const ProjectsPage = lazy(() =>
  import('@/pages/admin/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
);
const ProfessionalsPage = lazy(() =>
  import('@/pages/admin/ProfessionalsPage').then((m) => ({ default: m.ProfessionalsPage }))
);
const HourlyRatesPage = lazy(() =>
  import('@/pages/admin/HourlyRatesPage').then((m) => ({ default: m.HourlyRatesPage }))
);
const FinancialManagementPage = lazy(() =>
  import('@/pages/admin/FinancialManagementPage').then((m) => ({ default: m.FinancialManagementPage }))
);
const AccountingPeriodsPage = lazy(() =>
  import('@/pages/admin/AccountingPeriodsPage').then((m) => ({ default: m.AccountingPeriodsPage }))
);
const AuditLogPage = lazy(() =>
  import('@/pages/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage }))
);
const BudgetVsActualPage = lazy(() =>
  import('@/pages/admin/BudgetVsActualPage').then((m) => ({ default: m.BudgetVsActualPage }))
);
const ChartsPage = lazy(() =>
  import('@/pages/admin/ChartsPage').then((m) => ({ default: m.ChartsPage }))
);
const ProfitabilityAlertsPage = lazy(() =>
  import('@/pages/admin/ProfitabilityAlertsPage').then((m) => ({ default: m.ProfitabilityAlertsPage }))
);
const SystemStatusPage = lazy(() =>
  import('@/pages/admin/SystemStatusPage').then((m) => ({ default: m.SystemStatusPage }))
);
const ProjectWorkspacePage = lazy(() =>
  import('@/pages/admin/ProjectWorkspacePage').then((m) => ({ default: m.ProjectWorkspacePage }))
);
const AdminTimeEntriesPage = lazy(() =>
  import('@/pages/admin/AdminTimeEntriesPage').then((m) => ({ default: m.AdminTimeEntriesPage }))
);
const CapacityPlanningPage = lazy(() =>
  import('@/pages/admin/CapacityPlanningPage').then((m) => ({ default: m.CapacityPlanningPage }))
);
const ProjectHealthPage = lazy(() =>
  import('@/pages/admin/ProjectHealthPage').then((m) => ({ default: m.ProjectHealthPage }))
);

/**
 * Authenticated application shell.
 *
 * Every protected route renders inside the same <Layout> (sidebar + header +
 * themed canvas) via a nested layout route, so no page can accidentally ship
 * without the shell. <ProtectedRoute> stays per-route to preserve role checks
 * and redirects; when it redirects, the <Navigate> replaces the <Outlet>
 * content and the shell is unmounted by the router.
 */
function AuthenticatedShell() {
  return (
    <Layout>
      <Suspense
        fallback={
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </Layout>
  );
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no authenticated shell */}
        <Route path="/" element={<RootPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />

        {/* Authenticated routes — shared shell */}
        <Route element={<AuthenticatedShell />}>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requiredRole="admin">
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-dashboard"
            element={
              <ProtectedRoute requiredRole="member">
                <ProfessionalDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/time-entries"
            element={
              <ProtectedRoute requiredRole="member">
                <TimeEntriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/report"
            element={
              <ProtectedRoute requiredRole="admin">
                <ReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/projects"
            element={
              <ProtectedRoute requiredRole="admin">
                <ProjectsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <ProtectedRoute requiredRole="member">
                <ProjectWorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/professionals"
            element={
              <ProtectedRoute requiredRole="admin">
                <ProfessionalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/hourly-rates"
            element={
              <ProtectedRoute requiredRole="admin">
                <HourlyRatesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/financial"
            element={
              <ProtectedRoute requiredRole="admin">
                <FinancialManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/periods"
            element={
              <ProtectedRoute requiredRole="admin">
                <AccountingPeriodsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute requiredRole="admin">
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/time-entries"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminTimeEntriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recurring"
            element={
              <ProtectedRoute requiredRole="member">
                <RecurringRulesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/time-entries/calendar"
            element={
              <ProtectedRoute requiredRole="member">
                <WeeklyCalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/budget"
            element={
              <ProtectedRoute requiredRole="admin">
                <BudgetVsActualPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/charts"
            element={
              <ProtectedRoute requiredRole="admin">
                <ChartsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/alerts"
            element={
              <ProtectedRoute requiredRole="admin">
                <ProfitabilityAlertsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/system-status"
            element={
              <ProtectedRoute requiredRole="admin">
                <SystemStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/capacity"
            element={
              <ProtectedRoute requiredRole="admin">
                <CapacityPlanningPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/project-health"
            element={
              <ProtectedRoute requiredRole="admin">
                <ProjectHealthPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
