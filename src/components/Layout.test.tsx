import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout';

const mockUseAuthContext = vi.fn();
const mockLogout = vi.fn();

vi.mock('@/features/auth/useAuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

vi.mock('@/components/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

function renderLayout(props: { isAdmin?: boolean; children?: React.ReactNode } = {}) {
  mockUseAuthContext.mockReturnValue({
    user: { id: 'u1', email: 'user@focon.com' },
    profile: { role: props.isAdmin ? 'admin' : 'member' },
    isAdmin: props.isAdmin ?? false,
    logout: mockLogout,
    loading: false,
  });
  return render(
    <MemoryRouter>
      <Layout>{props.children ?? <div data-testid="page-content">Page</div>}</Layout>
    </MemoryRouter>
  );
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('renders the sidebar, header and page content', () => {
    renderLayout();
    expect(screen.getByText('FoconFlow')).toBeInTheDocument();
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('uses the themed canvas class (bg-app-canvas) so the shell follows the theme', () => {
    const { container } = renderLayout();
    const shell = container.querySelector('.bg-app-canvas');
    expect(shell).not.toBeNull();
  });

  it('renders admin navigation for admin users', () => {
    renderLayout({ isAdmin: true });
    expect(screen.getByText('Painel Administrativo')).toBeInTheDocument();
    expect(screen.getByText('Projetos')).toBeInTheDocument();
  });

  it('renders member navigation for member users', () => {
    renderLayout({ isAdmin: false });
    expect(screen.getByText('Meu Painel')).toBeInTheDocument();
    expect(screen.getByText('Meus Apontamentos')).toBeInTheDocument();
  });

  it('shows the user email in the sidebar footer', () => {
    renderLayout();
    expect(screen.getByText('user@focon.com')).toBeInTheDocument();
  });

  it('renders the Sair (logout) button', () => {
    renderLayout();
    expect(screen.getByText('Sair')).toBeInTheDocument();
  });
});
