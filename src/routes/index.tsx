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
import { ProjectsPage } from '@/pages/admin/ProjectsPage';
import { ProfessionalsPage } from '@/pages/admin/ProfessionalsPage';
import { HourlyRatesPage } from '@/pages/admin/HourlyRatesPage';
import { FinancialManagementPage } from '@/pages/admin/FinancialManagementPage';
import { AccountingPeriodsPage } from '@/pages/admin/AccountingPeriodsPage';
import { AuditLogPage } from '@/pages/admin/AuditLogPage';
import { RecurringRulesPage } from '@/pages/RecurringRulesPage';
import { WeeklyCalendarPage } from '@/pages/WeeklyCalendarPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { BudgetVsActualPage } from '@/pages/admin/BudgetVsActualPage';
import { ChartsPage } from '@/pages/admin/ChartsPage';
import { ProfitabilityAlertsPage } from '@/pages/admin/ProfitabilityAlertsPage';
import { SystemStatusPage } from '@/pages/admin/SystemStatusPage';
import { ProjectWorkspacePage } from '@/pages/admin/ProjectWorkspacePage';
import { ProtectedRoute } from './ProtectedRoute';

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
      <Outlet />
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
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
