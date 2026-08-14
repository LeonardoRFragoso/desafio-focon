import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommentsPanel } from './CommentsPanel';
import { AuthContext } from '@/features/auth/AuthContext';
import * as api from '@/lib/supabase/api';

vi.mock('@/lib/supabase/api', () => ({
  commentsAPI: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
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

describe('CommentsPanel', () => {
  it('shows empty state when no comments', async () => {
    vi.mocked(api.commentsAPI.list).mockResolvedValue({ data: [], error: null } as never);
    renderWithProviders(<CommentsPanel entryId="entry-1" isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByText(/Nenhum comentário ainda/)).toBeInTheDocument();
    });
  });

  it('displays existing comments with author and datetime', async () => {
    vi.mocked(api.commentsAPI.list).mockResolvedValue({
      data: [
        {
          id: 'c1',
          time_entry_id: 'entry-1',
          author_id: 'user-2',
          body: 'Looks good!',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          author: { full_name: 'Jane Doe' },
        },
      ],
      error: null,
    } as never);
    renderWithProviders(<CommentsPanel entryId="entry-1" isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('Looks good!')).toBeInTheDocument();
    });
  });

  it('shows admin badge for comments from admin when viewer is admin', async () => {
    vi.mocked(api.commentsAPI.list).mockResolvedValue({
      data: [
        {
          id: 'c1',
          time_entry_id: 'entry-1',
          author_id: 'user-2',
          body: 'Admin comment',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          author: { full_name: 'Admin User' },
        },
      ],
      error: null,
    } as never);
    const adminAuth = {
      user: { id: 'user-1', email: 'test@test.com' },
      profile: { id: 'user-1', full_name: 'Test User', role: 'admin' as const },
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: true,
    } as never;
    render(
      <MemoryRouter>
        <AuthContext.Provider value={adminAuth}>
          <CommentsPanel entryId="entry-1" isAdmin={true} />
        </AuthContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });
  });

  it('submits new comment via form', async () => {
    vi.mocked(api.commentsAPI.list).mockResolvedValue({ data: [], error: null } as never);
    vi.mocked(api.commentsAPI.create).mockResolvedValue({
      data: { id: 'c2', body: 'New comment' },
      error: null,
    } as never);
    renderWithProviders(<CommentsPanel entryId="entry-1" isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Escreva um comentário/)).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText(/Escreva um comentário/);
    fireEvent.change(input, { target: { value: 'New comment' } });
    const form = input.closest('form')!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(api.commentsAPI.create).toHaveBeenCalledWith('entry-1', 'user-1', 'New comment');
    });
  });

  it('shows error when comment is too short', async () => {
    vi.mocked(api.commentsAPI.list).mockResolvedValue({ data: [], error: null } as never);
    renderWithProviders(<CommentsPanel entryId="entry-1" isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Escreva um comentário/)).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText(/Escreva um comentário/);
    fireEvent.change(input, { target: { value: 'a' } });
    const form = input.closest('form')!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText(/muito curto/)).toBeInTheDocument();
    });
  });
});
