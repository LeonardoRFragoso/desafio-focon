import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders page info correctly', () => {
    render(<Pagination page={2} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText(/Página/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // totalPages = ceil(50/20) = 3
    expect(screen.getByText(/50 registros/)).toBeInTheDocument();
  });

  it('disables Previous on first page', () => {
    render(<Pagination page={1} pageSize={20} total={50} onPageChange={vi.fn()} />);
    const prevBtn = screen.getByText('Anterior');
    expect(prevBtn).toBeDisabled();
  });

  it('disables Next on last page', () => {
    render(<Pagination page={3} pageSize={20} total={50} onPageChange={vi.fn()} />);
    const nextBtn = screen.getByText('Próxima');
    expect(nextBtn).toBeDisabled();
  });

  it('calls onPageChange with next page', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={20} total={50} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Próxima'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with previous page', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={20} total={50} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Anterior'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('returns null when total is 0', () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={0} onPageChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows singular "registro" for 1 record', () => {
    render(<Pagination page={1} pageSize={20} total={1} onPageChange={vi.fn()} />);
    expect(screen.getByText(/1 registro/)).toBeInTheDocument();
  });
});
