import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      updateUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

import { supabase } from '@/lib/supabase/client';

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>
  );
}

describe('ResetPasswordPage', () => {
  it('shows session checking initially', () => {
    vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText('Verificando sessão...')).toBeInTheDocument();
  });

  it('shows invalid link message when no session', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Link inválido ou expirado')).toBeInTheDocument();
    });
  });

  it('shows password form when session is active', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token' } },
      error: null,
    } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/Nova Senha/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Confirmar Senha/)).toBeInTheDocument();
    });
  });

  it('validates password length', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token' } },
      error: null,
    } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/Nova Senha/)).toBeInTheDocument();
    });
    const passwordInput = screen.getByLabelText(/Nova Senha/);
    const confirmInput = screen.getByLabelText(/Confirmar Senha/);
    fireEvent.change(passwordInput, { target: { value: 'short' } });
    fireEvent.change(confirmInput, { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Atualizar Senha'));
    await waitFor(() => {
      expect(screen.getByText(/pelo menos 8 caracteres/)).toBeInTheDocument();
    });
  });

  it('validates password match', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token' } },
      error: null,
    } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/Nova Senha/)).toBeInTheDocument();
    });
    const passwordInput = screen.getByLabelText(/Nova Senha/);
    const confirmInput = screen.getByLabelText(/Confirmar Senha/);
    fireEvent.change(passwordInput, { target: { value: 'Password1' } });
    fireEvent.change(confirmInput, { target: { value: 'Password2' } });
    fireEvent.click(screen.getByText('Atualizar Senha'));
    await waitFor(() => {
      expect(screen.getByText(/não coincidem/)).toBeInTheDocument();
    });
  });

  it('validates password complexity', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token' } },
      error: null,
    } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/Nova Senha/)).toBeInTheDocument();
    });
    const passwordInput = screen.getByLabelText(/Nova Senha/);
    const confirmInput = screen.getByLabelText(/Confirmar Senha/);
    fireEvent.change(passwordInput, { target: { value: 'alllowercase' } });
    fireEvent.change(confirmInput, { target: { value: 'alllowercase' } });
    fireEvent.click(screen.getByText('Atualizar Senha'));
    await waitFor(() => {
      // The error message should appear in the error alert (red text)
      const errorAlert = screen.getByText(/A senha deve conter pelo menos uma letra maiúscula/);
      expect(errorAlert).toBeInTheDocument();
    });
  });
});
