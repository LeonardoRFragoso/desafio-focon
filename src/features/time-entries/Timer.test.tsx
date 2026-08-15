import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Timer } from '@/features/time-entries/Timer';

// Mock the API
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          order: vi.fn(() => ({ data: [{ id: 'p1', name: 'Project A' }] })),
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/supabase/api', () => ({
  timeEntriesAPI: {
    create: vi.fn().mockResolvedValue({ error: null }),
  },
  projectPhasesAPI: {
    listByProject: vi.fn().mockResolvedValue({ data: [] }),
  },
  projectTasksAPI: {
    listByProject: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock('@/lib/errors', () => ({
  mapDatabaseError: (err: unknown) => (err instanceof Error ? err.message : 'Erro'),
}));

function renderTimer(props: Partial<Parameters<typeof Timer>[0]> = {}) {
  return render(
    <MemoryRouter>
      <Timer userId="user-1" onEntryCreated={vi.fn()} {...props} />
    </MemoryRouter>
  );
}

describe('Timer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders start button when no active timer', () => {
    renderTimer();
    expect(screen.getByText('Iniciar Timer')).toBeInTheDocument();
  });

  it('opens start modal when start button is clicked', async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByText('Iniciar Timer'));
    expect(screen.getByText('Selecione...')).toBeInTheDocument();
  });

  it('starts timer when project is selected and form submitted', async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByText('Iniciar Timer'));
    const projectSelect = screen.getByLabelText('Projeto *');
    await user.selectOptions(projectSelect, 'p1');
    const form = document.getElementById('timer-start-form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('Timer em andamento')).toBeInTheDocument();
    });
    expect(screen.getByText('Rodando')).toBeInTheDocument();
  });

  it('persists timer state to localStorage', async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByText('Iniciar Timer'));
    const projectSelect = screen.getByLabelText('Projeto *');
    await user.selectOptions(projectSelect, 'p1');
    const form = document.getElementById('timer-start-form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('Timer em andamento')).toBeInTheDocument();
    });
    const stored = localStorage.getItem('foconflow_timer');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.project_id).toBe('p1');
    expect(parsed.status).toBe('running');
  });

  it('shows pause and finish buttons when running', async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByText('Iniciar Timer'));
    const projectSelect = screen.getByLabelText('Projeto *');
    await user.selectOptions(projectSelect, 'p1');
    const form = document.getElementById('timer-start-form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('Pausar')).toBeInTheDocument();
    });
    expect(screen.getByText('Finalizar')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('pauses and resumes the timer', async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByText('Iniciar Timer'));
    const projectSelect = screen.getByLabelText('Projeto *');
    await user.selectOptions(projectSelect, 'p1');
    const form = document.getElementById('timer-start-form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText('Pausar')).toBeInTheDocument());
    await user.click(screen.getByText('Pausar'));
    await waitFor(() => expect(screen.getByText('Pausado')).toBeInTheDocument());
    expect(screen.getByText('Continuar')).toBeInTheDocument();
    await user.click(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('Rodando')).toBeInTheDocument());
  });

  it('cancels the timer and clears state', async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByText('Iniciar Timer'));
    const projectSelect = screen.getByLabelText('Projeto *');
    await user.selectOptions(projectSelect, 'p1');
    const form = document.getElementById('timer-start-form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText('Cancelar')).toBeInTheDocument());
    await user.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(screen.getByText('Iniciar Timer')).toBeInTheDocument());
    expect(localStorage.getItem('foconflow_timer')).toBeNull();
  });

  it('opens finish modal with description form', async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByText('Iniciar Timer'));
    const projectSelect = screen.getByLabelText('Projeto *');
    await user.selectOptions(projectSelect, 'p1');
    const form = document.getElementById('timer-start-form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText('Finalizar')).toBeInTheDocument());
    await user.click(screen.getByText('Finalizar'));
    await waitFor(() => expect(screen.getByText('Finalizar Apontamento')).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/mínimo 10 caracteres/)).toBeInTheDocument();
  });

  it('restores timer state from localStorage on mount', async () => {
    const persistedState = {
      project_id: 'p1',
      phase_id: null,
      task_id: null,
      started_at: Date.now(),
      accumulated_seconds: 60,
      status: 'running',
      paused_at: null,
    };
    localStorage.setItem('foconflow_timer', JSON.stringify(persistedState));

    renderTimer();
    await waitFor(() => expect(screen.getByText('Timer em andamento')).toBeInTheDocument());
  });

  it('restores paused timer state from localStorage', async () => {
    const persistedState = {
      project_id: 'p1',
      phase_id: null,
      task_id: null,
      started_at: Date.now(),
      accumulated_seconds: 120,
      status: 'paused',
      paused_at: Date.now(),
    };
    localStorage.setItem('foconflow_timer', JSON.stringify(persistedState));

    renderTimer();
    await waitFor(() => expect(screen.getByText('Pausado')).toBeInTheDocument());
    expect(screen.getByText('Continuar')).toBeInTheDocument();
  });
});
