import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AttachmentsPanel } from './AttachmentsPanel';
import { AuthContext } from '@/features/auth/AuthContext';

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        createSignedUrl: vi.fn(),
        remove: vi.fn(),
      })),
    },
  },
}));

const mockAuthValue = {
  user: { id: 'user-1', email: 'test@test.com' },
  profile: { id: 'user-1', full_name: 'Test User', role: 'member' as const },
  loading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  isAdmin: false,
} as never;

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={mockAuthValue}>{ui}</AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('AttachmentsPanel', () => {
  it('shows empty state when no attachments', async () => {
    renderWithProviders(<AttachmentsPanel entryId="entry-1" />);
    await waitFor(() => {
      expect(screen.getByText(/Nenhum anexo/)).toBeInTheDocument();
    });
  });

  it('shows upload button (Adicionar Anexo)', async () => {
    renderWithProviders(<AttachmentsPanel entryId="entry-1" />);
    await waitFor(() => {
      expect(screen.getByText('Adicionar Anexo')).toBeInTheDocument();
    });
  });

  it('shows max size hint', async () => {
    renderWithProviders(<AttachmentsPanel entryId="entry-1" />);
    await waitFor(() => {
      expect(screen.getByText(/Máx\./)).toBeInTheDocument();
    });
    expect(screen.getByText(/10\.0 MB/)).toBeInTheDocument();
  });
});
