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

describe('ProjectTasksTab — deep link race condition (A13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByProjectPhasesMock.mockResolvedValue({ data: [] });
    listProfilesMock.mockResolvedValue({ data: [] });
    // Stub scrollIntoView (not implemented in jsdom)
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('waits for the task to render before scrolling (task loads after highlight is set)', async () => {
    // Simulate the async load: tasks resolve after a tick.
    let resolveTasks: (value: { data: unknown }) => void = () => {};
    listByProjectTasksMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTasks = resolve as (value: { data: unknown }) => void;
      })
    );

    const onTaskHighlightCleared = vi.fn();
    renderTab({ highlightTaskId: 'task-99', onTaskHighlightCleared });

    // While tasks are still loading, the target element does not exist yet.
    // The highlight should NOT have been cleared prematurely.
    expect(onTaskHighlightCleared).not.toHaveBeenCalled();

    // Now resolve the async load — the task appears in the DOM.
    await act(async () => {
      resolveTasks({ data: [makeTask('task-99', 'Excavation')] });
    });

    // After the task renders, scrollIntoView should have been called on it.
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('scrolls to the task when it is already loaded on mount', async () => {
    listByProjectTasksMock.mockResolvedValue({ data: [makeTask('task-1', 'Design')] });
    renderTab({ highlightTaskId: 'task-1', onTaskHighlightCleared: vi.fn() });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('clears the highlight after a few seconds once the task is found', async () => {
    vi.useFakeTimers();
    listByProjectTasksMock.mockResolvedValue({ data: [makeTask('task-1', 'Design')] });
    const onTaskHighlightCleared = vi.fn();
    renderTab({ highlightTaskId: 'task-1', onTaskHighlightCleared });
    // Flush the initial effect + rAF
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // The highlight clear timer is 5s
    expect(onTaskHighlightCleared).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(onTaskHighlightCleared).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not scroll before the task exists in the DOM', async () => {
    // Tasks load slowly; ensure no scroll happens before the element exists.
    let resolveTasks: (value: { data: unknown }) => void = () => {};
    listByProjectTasksMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTasks = resolve as (value: { data: unknown }) => void;
      })
    );
    renderTab({ highlightTaskId: 'task-99', onTaskHighlightCleared: vi.fn() });
    // Give it a couple of rAF cycles — still no scroll because element is absent
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
});
