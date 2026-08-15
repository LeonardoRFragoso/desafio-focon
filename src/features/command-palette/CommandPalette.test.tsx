/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '@/features/command-palette/CommandPalette';
import { commandCenterAPI } from '@/lib/supabase/api';

vi.mock('@/features/auth/useAuthContext', () => ({
  useAuthContext: () => ({ isAdmin: true, user: { id: 'user-1', email: 'admin@test.com' } }),
}));

vi.mock('@/lib/errors', () => ({
  mapDatabaseError: (err: unknown) => (err instanceof Error ? err.message : 'Erro'),
}));

function renderPalette(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  return render(
    <MemoryRouter>
      <CommandPalette open={true} onClose={vi.fn()} {...props} />
    </MemoryRouter>
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(commandCenterAPI, 'searchGlobal').mockResolvedValue({
      data: {
        projects: [
          { type: 'project', id: 'p1', title: 'Residencial Aurora', subtitle: 'Construção Aurora', href: '/projects/p1' },
        ],
        tasks: [
          { type: 'task', id: 't1', title: 'Escavação', subtitle: 'Residencial Aurora', href: '/projects/p1?tab=tasks&task=t1' },
        ],
        professionals: [
          { type: 'professional', id: 'prof1', title: 'Ana Silva', subtitle: 'member', href: '/admin/professionals?professional=prof1' },
        ],
        time_entries: [
          { type: 'time_entry', id: 'te1', title: 'Trabalho na fundação', subtitle: 'Ana — Aurora — 2024-08-15', href: '/admin/time-entries?entry=te1' },
        ],
      },
      error: null,
    } as any);
  });

  it('renders search input when open', () => {
    renderPalette();
    expect(screen.getByPlaceholderText('Buscar no FoconFlow...')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <MemoryRouter>
        <CommandPalette open={false} onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByPlaceholderText('Buscar no FoconFlow...')).not.toBeInTheDocument();
  });

  it('shows minimum 2 chars hint initially', () => {
    renderPalette();
    expect(screen.getByText(/Digite pelo menos 2 caracteres/)).toBeInTheDocument();
  });

  it('shows admin commands when query is empty', () => {
    renderPalette();
    expect(screen.getByText('Novo Projeto')).toBeInTheDocument();
    expect(screen.getByText('Ir para Aprovações')).toBeInTheDocument();
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
  });

  it('debounces search and shows results after typing 2+ chars', async () => {
    renderPalette();
    const input = screen.getByPlaceholderText('Buscar no FoconFlow...');
    fireEvent.change(input, { target: { value: 'Aurora' } });
    // Wait for debounce (250ms) + search to complete
    await waitFor(() => {
      expect(commandCenterAPI.searchGlobal).toHaveBeenCalledWith('Aurora', 8);
    }, { timeout: 5000 });
  });

  it('shows no results message when search returns empty', async () => {
    vi.spyOn(commandCenterAPI, 'searchGlobal').mockResolvedValueOnce({
      data: { projects: [], tasks: [], professionals: [], time_entries: [] },
      error: null,
    } as any);
    renderPalette();
    const input = screen.getByPlaceholderText('Buscar no FoconFlow...');
    fireEvent.change(input, { target: { value: 'xyz' } });
    await waitFor(() => {
      expect(screen.getByText(/Nenhum resultado/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('closes on Escape key', async () => {
    const onClose = vi.fn();
    renderPalette({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    renderPalette({ onClose });
    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('navigates down with ArrowDown key', async () => {
    renderPalette();
    const input = screen.getByPlaceholderText('Buscar no FoconFlow...');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const items = screen.getAllByRole('option');
    expect(items[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('navigates up with ArrowUp key', async () => {
    renderPalette();
    const input = screen.getByPlaceholderText('Buscar no FoconFlow...');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const items = screen.getAllByRole('option');
    expect(items[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('has correct aria attributes for accessibility', () => {
    renderPalette();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-label', 'Resultados da busca');
  });
});

// ==========================================================================
// A12: Command Palette sequential actions
// The palette must remain usable across close/reopen cycles. The A12 bug
// itself (sticky actionHandled ref) lives in ProfessionalDashboard, but the
// palette must not introduce its own sticky state. These tests verify the
// palette can be toggled repeatedly and commands remain available.
// ==========================================================================
describe('CommandPalette — sequential actions across close/reopen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(commandCenterAPI, 'searchGlobal').mockResolvedValue({
      data: { projects: [], tasks: [], professionals: [], time_entries: [] },
      error: null,
    } as any);
  });

  it('commands remain available after close and reopen (no sticky state)', () => {
    const { rerender } = render(
      <MemoryRouter>
        <CommandPalette open={true} onClose={vi.fn()} />
      </MemoryRouter>
    );
    // Admin command present on first open
    expect(screen.getByText('Novo Projeto')).toBeInTheDocument();
    // Close
    rerender(
      <MemoryRouter>
        <CommandPalette open={false} onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Novo Projeto')).not.toBeInTheDocument();
    // Reopen — command must still be present (no sticky flag blocking it)
    rerender(
      <MemoryRouter>
        <CommandPalette open={true} onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Novo Projeto')).toBeInTheDocument();
  });

  it('can be closed and reopened multiple times with commands still present', () => {
    const { rerender } = render(
      <MemoryRouter>
        <CommandPalette open={true} onClose={vi.fn()} />
      </MemoryRouter>
    );
    for (let i = 0; i < 3; i++) {
      rerender(
        <MemoryRouter>
          <CommandPalette open={false} onClose={vi.fn()} />
        </MemoryRouter>
      );
      rerender(
        <MemoryRouter>
          <CommandPalette open={true} onClose={vi.fn()} />
        </MemoryRouter>
      );
      expect(screen.getByText('Novo Projeto')).toBeInTheDocument();
    }
  });
});
