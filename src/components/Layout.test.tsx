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

  it('renders Meta Semanal item in member sidebar', () => {
    renderLayout({ isAdmin: false });
    expect(screen.getByText('Meta Semanal')).toBeInTheDocument();
  });

  it('does NOT render Meta Semanal item in admin sidebar', () => {
    renderLayout({ isAdmin: true });
    expect(screen.queryByText('Meta Semanal')).not.toBeInTheDocument();
  });

  it('shows the user email in the sidebar footer', () => {
    renderLayout();
    expect(screen.getByText('user@focon.com')).toBeInTheDocument();
  });

  it('renders the Sair (logout) button', () => {
    renderLayout();
    expect(screen.getByText('Sair')).toBeInTheDocument();
  });

  it('aligns header controls to the right via ml-auto', () => {
    const { container } = renderLayout();
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    const controlsDiv = header?.querySelector('.ml-auto');
    expect(controlsDiv).not.toBeNull();
    // The controls group should contain the bell, theme toggle and role label
    expect(controlsDiv?.querySelector('[data-testid="notification-bell"]')).not.toBeNull();
    expect(controlsDiv?.querySelector('[data-testid="theme-toggle"]')).not.toBeNull();
  });

  it('uses a coherent z-index hierarchy (header below sidebar)', () => {
    const { container } = renderLayout();
    const header = container.querySelector('header');
    const aside = container.querySelector('aside');
    expect(header?.className).toContain('z-30');
    expect(aside?.className).toContain('z-[60]');
  });

  it('sidebar nav has the sidebar-scrollbar class', () => {
    const { container } = renderLayout();
    const nav = container.querySelector('aside nav');
    expect(nav?.className).toContain('sidebar-scrollbar');
  });

  it('sidebar uses flex-col structure with shrink-0 brand and footer', () => {
    const { container } = renderLayout();
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('flex flex-col');
    // Brand area (first child) should be shrink-0
    const brandArea = aside?.children[0];
    expect(brandArea?.className).toContain('shrink-0');
    // Footer (last child) should be shrink-0 and NOT absolute
    const footer = aside?.lastElementChild;
    expect(footer?.className).toContain('shrink-0');
    expect(footer?.className).not.toContain('absolute');
  });

  it('sidebar nav is the scrollable flex-1 region', () => {
    const { container } = renderLayout();
    const nav = container.querySelector('aside nav');
    expect(nav?.className).toContain('flex-1');
    expect(nav?.className).toContain('min-h-0');
    expect(nav?.className).toContain('overflow-y-auto');
  });

  it('footer remains outside the scrollable navigation', () => {
    const { container } = renderLayout();
    const aside = container.querySelector('aside');
    const nav = aside?.querySelector('nav');
    const footer = aside?.lastElementChild;
    // The footer should NOT be inside the nav
    expect(nav?.contains(footer ?? null)).toBe(false);
    // The footer should contain the user email and logout button
    expect(footer?.textContent).toContain('user@focon.com');
    expect(footer?.textContent).toContain('Sair');
  });
});
