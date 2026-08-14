import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { RootPage } from '@/pages/RootPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TimeEntriesPage } from '@/pages/TimeEntriesPage';
import { ReportPage } from '@/pages/ReportPage';
import { ProfessionalDashboardPage } from '@/pages/ProfessionalDashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AccessDeniedPage } from '@/pages/AccessDeniedPage';
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
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
