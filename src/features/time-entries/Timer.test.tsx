import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Timer } from '@/features/time-entries/Timer';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

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

const phasesMock = vi.fn();
const tasksMock = vi.fn();

vi.mock('@/lib/supabase/api', () => ({
  timeEntriesAPI: {
    create: vi.fn().mockResolvedValue({ error: null }),
  },
  projectPhasesAPI: {
    listByProject: (...args: unknown[]) => phasesMock(...args),
  },
  projectTasksAPI: {
    listByProject: (...args: unknown[]) => tasksMock(...args),
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
    // Restore default implementations after clearAllMocks
    phasesMock.mockResolvedValue({ data: [] });
    tasksMock.mockResolvedValue({ data: [] });
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

  // ========================================================================
  // A9-A11: empty states, admin CTA, task filtering rules
  // ========================================================================
  describe('empty states and admin CTA', () => {
    beforeEach(() => {
      phasesMock.mockResolvedValue({ data: [] });
      tasksMock.mockResolvedValue({ data: [] });
    });

    it('shows "Nenhuma fase cadastrada" when project has no phases', async () => {
      const user = userEvent.setup();
      renderTimer();
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => {
        expect(screen.getByText('Nenhuma fase cadastrada')).toBeInTheDocument();
      });
    });

    it('shows "Nenhuma tarefa cadastrada" when project has no tasks', async () => {
      const user = userEvent.setup();
      renderTimer();
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => {
        expect(screen.getByText('Nenhuma tarefa cadastrada')).toBeInTheDocument();
      });
    });

    it('shows admin "Gerenciar fases" CTA when isAdmin and project has no phases', async () => {
      const user = userEvent.setup();
      renderTimer({ isAdmin: true });
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => {
        expect(screen.getByText('Gerenciar fases →')).toBeInTheDocument();
      });
    });

    it('shows admin "Gerenciar tarefas" CTA when isAdmin and project has no tasks', async () => {
      const user = userEvent.setup();
      renderTimer({ isAdmin: true });
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => {
        expect(screen.getByText('Gerenciar tarefas →')).toBeInTheDocument();
      });
    });

    it('does NOT show admin CTA for non-admin members', async () => {
      const user = userEvent.setup();
      renderTimer({ isAdmin: false });
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => {
        expect(screen.getByText('Este projeto ainda não possui fases cadastradas.')).toBeInTheDocument();
      });
      expect(screen.queryByText('Gerenciar fases →')).not.toBeInTheDocument();
      expect(screen.queryByText('Gerenciar tarefas →')).not.toBeInTheDocument();
    });

    it('navigates to project phases tab when admin clicks Gerenciar fases', async () => {
      navigateMock.mockReset();
      const user = userEvent.setup();
      renderTimer({ isAdmin: true });
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => expect(screen.getByText('Gerenciar fases →')).toBeInTheDocument());
      await user.click(screen.getByText('Gerenciar fases →'));
      expect(navigateMock).toHaveBeenCalledWith('/projects/p1?tab=phases');
    });
  });

  describe('task filtering rules', () => {
    beforeEach(() => {
      phasesMock.mockResolvedValue({
        data: [{ id: 'phase-1', name: 'Foundation' }],
      });
      tasksMock.mockResolvedValue({
        data: [
          { id: 'task-1', title: 'Excavation', phase_id: 'phase-1' },
          { id: 'task-2', title: 'Design (no phase)', phase_id: null },
        ],
      });
    });

    it('shows ALL tasks of the project when no phase is selected', async () => {
      const user = userEvent.setup();
      renderTimer();
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => {
        const taskSelect = screen.getByLabelText('Tarefa') as HTMLSelectElement;
        // Both tasks should be present (no phase filter)
        expect(taskSelect.querySelector('option[value="task-1"]')).not.toBeNull();
        expect(taskSelect.querySelector('option[value="task-2"]')).not.toBeNull();
      });
    });

    it('shows only tasks of the selected phase when a phase is selected', async () => {
      const user = userEvent.setup();
      renderTimer();
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => expect(screen.getByLabelText('Fase')).not.toBeDisabled());
      const phaseSelect = screen.getByLabelText('Fase');
      await user.selectOptions(phaseSelect, 'phase-1');
      const taskSelect = screen.getByLabelText('Tarefa') as HTMLSelectElement;
      await waitFor(() => {
        expect(taskSelect.querySelector('option[value="task-1"]')).not.toBeNull();
        expect(taskSelect.querySelector('option[value="task-2"]')).toBeNull();
      });
    });

    it('clears the selected task when it no longer belongs to the filter', async () => {
      const user = userEvent.setup();
      renderTimer();
      await user.click(screen.getByText('Iniciar Timer'));
      const projectSelect = screen.getByLabelText('Projeto *');
      await user.selectOptions(projectSelect, 'p1');
      await waitFor(() => expect(screen.getByLabelText('Tarefa')).not.toBeDisabled());
      const taskSelect = screen.getByLabelText('Tarefa') as HTMLSelectElement;
      // Select task-2 (no phase) while no phase is selected
      await user.selectOptions(taskSelect, 'task-2');
      expect(taskSelect.value).toBe('task-2');
      // Now select phase-1 -> task-2 is not in phase-1, so it should be cleared
      const phaseSelect = screen.getByLabelText('Fase');
      await user.selectOptions(phaseSelect, 'phase-1');
      await waitFor(() => {
        expect((screen.getByLabelText('Tarefa') as HTMLSelectElement).value).toBe('');
      });
    });
  });
});
