/**
 * Shared types for admin dashboard and reporting
 */

export interface AdminFilterValues {
  projectId: string;
  projectName: string;
  professionalId: string;
  professionalName: string;
  startDate: string;
  endDate: string;
}

export interface FilterOption {
  id: string;
  name: string;
}
