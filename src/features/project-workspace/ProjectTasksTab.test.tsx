import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectTasksTab } from './ProjectTasksTab';

// Mock the APIs so we can simulate the async load race condition.
const listByProjectTasksMock = vi.fn();
const listByProjectPhasesMock = vi.fn();
const listProfilesMock = vi.fn();

vi.mock('@/lib/supabase/api', () => ({
  projectTasksAPI: {
    listByProject: (...args: unknown[]) => listByProjectTasksMock(...args),
    update: vi.fn().mockResolvedValue({ error: null }),
  },
  projectPhasesAPI: {
    listByProject: (...args: unknown[]) => listByProjectPhasesMock(...args),
  },
  profilesAPI: {
    list: () => listProfilesMock(),
  },
}));

vi.mock('@/lib/errors', () => ({ mapDatabaseError: (e: unknown) => (e instanceof Error ? e.message : 'Erro') }));

function makeTask(id: string, title = `Task ${id}`) {
  return {
    id,
    project_id: 'p1',
    phase_id: null,
    assignee_id: null,
    title,
    description: 'desc',
    status: 'todo',
    priority: 'medium',
    estimated_minutes: 60,
    actual_minutes: 0,
    due_date: null,
    created_at: '2024-08-14T10:00:00Z',
    updated_at: null,
  };
}

function renderTab(props: Partial<Parameters<typeof ProjectTasksTab>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ProjectTasksTab projectId="p1" isAdmin={false} {...props} />
    </MemoryRouter>
  );
}

describe('ProjectTasksTab — deep link (state-based, A13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByProjectPhasesMock.mockResolvedValue({ data: [] });
    listProfilesMock.mockResolvedValue({ data: [] });
    // Stub scrollIntoView (not implemented in jsdom)
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('scrolls to the task when it is already loaded on mount', async () => {
    listByProjectTasksMock.mockResolvedValue({ data: [makeTask('task-1', 'Design')] });
    renderTab({ highlightTaskId: 'task-1', onTaskHighlightCleared: vi.fn() });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('waits for tasks to load before scrolling (async load race condition)', async () => {
    // Simulate the async load: tasks resolve after a tick.
    let resolveTasks: (value: { data: unknown }) => void = () => {};
    listByProjectTasksMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTasks = resolve as (value: { data: unknown }) => void;
      })
    );

    const onTaskHighlightCleared = vi.fn();
    renderTab({ highlightTaskId: 'task-99', onTaskHighlightCleared });

    // While tasks are still loading, no scroll should happen.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    // Now resolve the async load — the task appears and scroll fires.
    await act(async () => {
      resolveTasks({ data: [makeTask('task-99', 'Excavation')] });
    });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('does not scroll before tasks are loaded', async () => {
    // Tasks load slowly; ensure no scroll happens before the element exists.
    let resolveTasks: (value: { data: unknown }) => void = () => {};
    listByProjectTasksMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTasks = resolve as (value: { data: unknown }) => void;
      })
    );
    renderTab({ highlightTaskId: 'task-99', onTaskHighlightCleared: vi.fn() });
    // Give it a moment — still no scroll because tasks are loading
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    // Now resolve and expect scroll
    await act(async () => {
      resolveTasks({ data: [makeTask('task-99')] });
    });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('clears highlight for nonexistent task after load completes', async () => {
    listByProjectTasksMock.mockResolvedValue({ data: [makeTask('task-1')] });
    const onTaskHighlightCleared = vi.fn();
    renderTab({ highlightTaskId: 'nonexistent', onTaskHighlightCleared });
    // The task doesn't exist, so after load the highlight should be cleared
    // (1s timeout in the component)
    await waitFor(() => {
      expect(onTaskHighlightCleared).toHaveBeenCalled();
    }, { timeout: 3000 });
    // And no scroll should have happened
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('clears highlight after 5s when task is found', async () => {
    listByProjectTasksMock.mockResolvedValue({ data: [makeTask('task-1', 'Design')] });
    const onTaskHighlightCleared = vi.fn();
    renderTab({ highlightTaskId: 'task-1', onTaskHighlightCleared });
    // Wait for the scroll to happen
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
    // The highlight clear timer is 5s — not called yet
    expect(onTaskHighlightCleared).not.toHaveBeenCalled();
    // Wait for the 5s timer to fire (use longer timeout to avoid flakiness)
    await waitFor(() => {
      expect(onTaskHighlightCleared).toHaveBeenCalled();
    }, { timeout: 10000 });
  }, 15000);

  it('does not scroll again if highlightTaskId has not changed', async () => {
    listByProjectTasksMock.mockResolvedValue({ data: [makeTask('task-1')] });
    const { rerender } = renderTab({ highlightTaskId: 'task-1', onTaskHighlightCleared: vi.fn() });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });
    // Re-render with same props — the hasScrolledRef guard prevents duplicate scrolls
    rerender(
      <MemoryRouter>
        <ProjectTasksTab projectId="p1" isAdmin={false} highlightTaskId="task-1" onTaskHighlightCleared={vi.fn()} />
      </MemoryRouter>
    );
    // Wait a bit to ensure no additional scroll
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
