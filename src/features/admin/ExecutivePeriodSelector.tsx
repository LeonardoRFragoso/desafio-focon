 
export type PeriodPreset = '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'custom';

 
export interface PeriodRange {
  start_date: string;
  end_date: string;
}

interface ExecutivePeriodSelectorProps {
  preset: PeriodPreset;
  onChange: (preset: PeriodPreset, range: PeriodRange) => void;
}

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
];

function toDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getPeriodRange(preset: PeriodPreset): PeriodRange {
  const today = new Date();
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  switch (preset) {
    case '7d': {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      return { start_date: toDateStr(start), end_date: toDateStr(end) };
    }
    case '30d': {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { start_date: toDateStr(start), end_date: toDateStr(end) };
    }
    case '90d': {
      const start = new Date(today);
      start.setDate(start.getDate() - 90);
      return { start_date: toDateStr(start), end_date: toDateStr(end) };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start_date: toDateStr(start), end_date: toDateStr(end) };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start_date: toDateStr(start), end_date: toDateStr(lastEnd) };
    }
    case 'custom': {
      // Default to 30d for custom initial state
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { start_date: toDateStr(start), end_date: toDateStr(end) };
    }
  }
}

export function ExecutivePeriodSelector({ preset, onChange }: ExecutivePeriodSelectorProps) {
  const handleChange = (newPreset: PeriodPreset) => {
    if (newPreset === 'custom') {
      // For custom, keep current range
      onChange('custom', getPeriodRange('30d'));
    } else {
      onChange(newPreset, getPeriodRange(newPreset));
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Seletor de período">
      {PRESETS.map(p => (
        <button
          key={p.value}
          onClick={() => handleChange(p.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
            preset === p.value
              ? 'bg-focon-600 text-white'
              : 'bg-surface-secondary text-app-secondary hover:bg-hover-surface'
          }`}
          aria-pressed={preset === p.value}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
