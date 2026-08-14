import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase/client';

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
}

describe('ForgotPasswordPage', () => {
  it('renders email input and submit button', () => {
    renderPage();
    expect(screen.getByLabelText(/E-mail/)).toBeInTheDocument();
    expect(screen.getByText('Enviar Link de Recuperação')).toBeInTheDocument();
  });

  it('shows success message after submit', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null });
    renderPage();
    const input = screen.getByLabelText(/E-mail/);
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Enviar Link de Recuperação'));
    await waitFor(() => {
      expect(screen.getByText(/Se o e-mail existir/)).toBeInTheDocument();
    });
  });

  it('shows success message even on error (no email enumeration)', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: { message: 'User not found', name: 'AuthError' } as never,
    });
    renderPage();
    const input = screen.getByLabelText(/E-mail/);
    fireEvent.change(input, { target: { value: 'unknown@example.com' } });
    fireEvent.click(screen.getByText('Enviar Link de Recuperação'));
    await waitFor(() => {
      expect(screen.getByText(/Se o e-mail existir/)).toBeInTheDocument();
    });
  });

  it('calls resetPasswordForEmail with correct redirectTo', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null });
    renderPage();
    const input = screen.getByLabelText(/E-mail/);
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Enviar Link de Recuperação'));
    await waitFor(() => {
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          redirectTo: expect.stringContaining('/reset-password'),
        })
      );
    });
  });

  it('shows back to login link', () => {
    renderPage();
    expect(screen.getByText(/Voltar para Login/)).toBeInTheDocument();
  });
});
