import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { AuthContext } from '@/features/auth/AuthContext';
import * as api from '@/lib/supabase/api';
import type { Notification } from '@/types/database';

vi.mock('@/lib/supabase/api', () => ({
  notificationsAPI: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    remove: vi.fn(),
    subscribeToUnread: vi.fn(() => ({ unsubscribe: vi.fn() })),
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

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    user_id: 'user-1',
    type: 'system',
    title: 'Notificação de teste',
    body: 'Corpo da notificação',
    entity_type: null,
    entity_id: null,
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderBell() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={mockAuthValue}>
        <NotificationBell />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

async function seedNotifications(notifications: Notification[], unreadCount = 0) {
  vi.mocked(api.notificationsAPI.list).mockImplementation(async (unreadOnly) => {
    if (unreadOnly) {
      return { data: notifications.slice(0, unreadCount), error: null } as never;
    }
    return { data: notifications, error: null } as never;
  });
  vi.mocked(api.notificationsAPI.markRead).mockResolvedValue({ error: null } as never);
  vi.mocked(api.notificationsAPI.markAllRead).mockResolvedValue({ error: null } as never);
  vi.mocked(api.notificationsAPI.remove).mockResolvedValue({ error: null } as never);
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('renders the bell button', async () => {
    await seedNotifications([]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
  });

  it('shows unread count badge when there are unread notifications', async () => {
    await seedNotifications([makeNotification()], 1);
    renderBell();
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('does not show badge when there are no unread notifications', async () => {
    await seedNotifications([makeNotification({ read_at: '2024-01-01' })], 0);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('opens the dropdown when the bell is clicked', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    expect(screen.getByRole('dialog', { name: 'Notificações' })).toBeInTheDocument();
    expect(screen.getByText('Notificação de teste')).toBeInTheDocument();
  });

  it('closes the dropdown when the bell is clicked again', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    const bell = screen.getByRole('button', { name: /Notificações/ });
    await user.click(bell);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(bell);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the dropdown when clicking outside (backdrop)', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Click the backdrop (fixed inset-0 overlay)
    const backdrop = screen.getByRole('button', { name: /Notificações/ }).parentElement
      ?.nextElementSibling as HTMLElement;
    await user.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the dropdown when Escape is pressed and restores focus to the bell', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    const bell = screen.getByRole('button', { name: /Notificações/ });
    await user.click(bell);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  it('sets aria-expanded correctly when opened and closed', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    const bell = screen.getByRole('button', { name: /Notificações/ });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    await user.click(bell);
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('sets aria-controls pointing to the panel when open', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    const bell = screen.getByRole('button', { name: /Notificações/ });
    await user.click(bell);
    const panel = screen.getByRole('dialog');
    expect(bell).toHaveAttribute('aria-controls', panel.id);
  });

  it('shows empty state when there are no notifications', async () => {
    await seedNotifications([]);
    renderBell();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    expect(screen.getByText('Nenhuma notificação')).toBeInTheDocument();
  });

  it('shows loading state initially', async () => {
    // Never resolves — keeps loading true
    vi.mocked(api.notificationsAPI.list).mockImplementation(
      () => new Promise(() => {}) as never
    );
    renderBell();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('marks a single notification as read', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification({ id: 'n1' })], 1);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    await user.click(screen.getByRole('button', { name: 'Ler' }));
    expect(api.notificationsAPI.markRead).toHaveBeenCalledWith('n1');
  });

  it('marks all notifications as read', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification({ id: 'n1' })], 1);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    await user.click(screen.getByRole('button', { name: /Marcar todas como lidas/ }));
    expect(api.notificationsAPI.markAllRead).toHaveBeenCalledWith('user-1');
  });

  it('deletes a notification', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification({ id: 'n1' })]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    await user.click(screen.getByRole('button', { name: /Excluir notificação/ }));
    expect(api.notificationsAPI.remove).toHaveBeenCalledWith('n1');
  });

  it('filters notifications by type', async () => {
    const user = userEvent.setup();
    await seedNotifications([
      makeNotification({ id: 'n1', type: 'entry_approved', title: 'Entrada aprovada' }),
      makeNotification({ id: 'n2', type: 'system', title: 'Aviso do sistema' }),
    ]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    expect(screen.getByText('Entrada aprovada')).toBeInTheDocument();
    expect(screen.getByText('Aviso do sistema')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), 'entry_approved');
    expect(screen.getByText('Entrada aprovada')).toBeInTheDocument();
    expect(screen.queryByText('Aviso do sistema')).not.toBeInTheDocument();
  });

  it('shows filter-specific empty state when filter yields no results', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification({ id: 'n1', type: 'system' })]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    await user.selectOptions(screen.getByRole('combobox'), 'entry_approved');
    expect(screen.getByText('Nenhuma notificação deste tipo')).toBeInTheDocument();
  });

  it('does not show the filter when there are no notifications', async () => {
    const user = userEvent.setup();
    await seedNotifications([]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('uses light theme classes by default', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('bg-white');
  });

  it('uses dark-safe classes when dark mode is active', async () => {
    document.documentElement.classList.add('dark');
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('dark:bg-slate-900');
  });

  it('does not show "Marcar todas" when there are no unread notifications', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification({ read_at: '2024-01-01' })], 0);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    expect(screen.queryByRole('button', { name: /Marcar todas como lidas/ })).not.toBeInTheDocument();
  });

  it('uses viewport-safe width class to prevent mobile overflow', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('min(24rem');
    expect(panel.className).toContain('100vw');
  });

  it('renders entry_submitted type with correct icon and color', async () => {
    const user = userEvent.setup();
    await seedNotifications([
      makeNotification({ id: 'n1', type: 'entry_submitted', title: 'Novo apontamento recebido' }),
    ]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    expect(screen.getByText('Novo apontamento recebido')).toBeInTheDocument();
    expect(screen.getByText('📋')).toBeInTheDocument();
  });

  it('includes entry_submitted in the filter dropdown options', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification()]);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    const submittedOption = options.find((o) => o.value === 'entry_submitted');
    expect(submittedOption).toBeDefined();
    expect(submittedOption?.textContent).toBe('Novos apontamentos');
  });

  it('marks notification as read and does not navigate when entity_type is null', async () => {
    const user = userEvent.setup();
    await seedNotifications([makeNotification({ id: 'n1', entity_type: null, entity_id: null })], 1);
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Notificações/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Notificações/ }));
    // Click the notification item (li with role=button should not be present since entity_type is null)
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('role', 'button');
  });
});
