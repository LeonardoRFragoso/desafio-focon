import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PendingAttachments } from '@/features/time-entries/PendingAttachments';

function makeFile(name: string, size: number, type = 'application/pdf'): File {
  const file = new File(['x'.repeat(size)], name, { type });
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
}

describe('PendingAttachments', () => {
  it('renders the add button and hint', () => {
    render(<PendingAttachments files={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Anexos')).toBeInTheDocument();
    expect(screen.getByText('Adicionar Anexo')).toBeInTheDocument();
    expect(screen.getByText(/serão enviados após salvar/)).toBeInTheDocument();
  });

  it('calls onChange with valid files when selected', () => {
    const onChange = vi.fn();
    render(<PendingAttachments files={[]} onChange={onChange} />);
    const input = screen.getByLabelText('Adicionar anexos') as HTMLInputElement;
    const file = makeFile('doc.pdf', 1024, 'application/pdf');
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it('rejects files that are too large', () => {
    const onChange = vi.fn();
    render(<PendingAttachments files={[]} onChange={onChange} />);
    const input = screen.getByLabelText('Adicionar anexos') as HTMLInputElement;
    const big = makeFile('big.pdf', 11 * 1024 * 1024, 'application/pdf');
    fireEvent.change(input, { target: { files: [big] } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Arquivo muito grande/)).toBeInTheDocument();
  });

  it('rejects disallowed mime types', () => {
    const onChange = vi.fn();
    render(<PendingAttachments files={[]} onChange={onChange} />);
    const input = screen.getByLabelText('Adicionar anexos') as HTMLInputElement;
    const bad = makeFile('evil.exe', 1024, 'application/x-msdownload');
    fireEvent.change(input, { target: { files: [bad] } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Tipo de arquivo não permitido/)).toBeInTheDocument();
  });

  it('lists pending files and allows removal', () => {
    const onChange = vi.fn();
    const file = makeFile('doc.pdf', 2048, 'application/pdf');
    render(<PendingAttachments files={[file]} onChange={onChange} />);
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remover doc.pdf'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('disables inputs when disabled', () => {
    render(<PendingAttachments files={[]} onChange={vi.fn()} disabled />);
    const label = screen.getByText('Adicionar Anexo');
    expect(label.className).toContain('disabled');
  });
});
