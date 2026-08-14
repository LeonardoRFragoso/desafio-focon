import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { ProtectedRoute } from './ProtectedRoute';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootPage />} />
        <Route path="/login" element={<LoginPage />} />
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
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
