import { useState, useEffect, useCallback } from 'react';
import { hourlyRatesAPI, profilesAPI } from '@/lib/supabase/api';
import { supabase } from '@/lib/supabase/client';
import { mapDatabaseError } from '@/lib/errors';
import { businessTodayStr } from '@/lib/businessDate';
import { Modal } from '@/components/Modal';
import type { Profile } from '@/types/database';

interface HourlyRateRow {
  id: string;
  professional_id: string;
  hourly_rate: number;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  professional?: { full_name: string } | null;
}

interface RateHistoryEntry {
  id: string;
  hourly_rate: number;
  valid_from: string;
  valid_until: string | null;
}

export function HourlyRatesPage() {
  const [rates, setRates] = useState<HourlyRateRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState<HourlyRateRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await hourlyRatesAPI.list();
      if (err) throw err;
      setRates((data as HourlyRateRow[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar valores/hora');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    try {
      const { data, error: err } = await profilesAPI.list();
      if (err) throw err;
      setProfiles((data as Profile[]) || []);
    } catch {
      setProfiles([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRates();
     
    fetchProfiles();
  }, [fetchRates, fetchProfiles]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-app-primary">Valor/Hora</h2>
          <p className="text-app-muted">Gerencie os valores/hora dos profissionais</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition"
        >
          Nova Taxa
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {rates.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-secondary/50">
          <p className="text-app-muted">Nenhuma taxa cadastrada</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Profissional</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Valor/Hora</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Válido de</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Válido até</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {rates.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRate(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedRate(r);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver detalhes de ${r.professional?.full_name || 'profissional'}`}
                  className="hover:bg-hover-surface transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-focon-600"
                >
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">
                    {r.professional?.full_name || 'Desconhecido'}
                  </td>
                  <td className="px-4 py-3 text-sm text-app-primary font-semibold">{formatCurrency(r.hourly_rate)}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatDate(r.valid_from)}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">
                    {r.valid_until ? formatDate(r.valid_until) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${r.valid_until ? 'bg-slate-100 text-slate-700 bg-surface-secondary text-app-secondary' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {r.valid_until ? 'Encerrada' : 'Vigente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <RateFormModal
          profiles={profiles}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchRates();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {selectedRate && (
        <HourlyRateDetailsModal
          rate={selectedRate}
          onClose={() => setSelectedRate(null)}
        />
      )}
    </div>
  );
}

interface RateFormModalProps {
  profiles: Profile[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function RateFormModal({ profiles, onClose, onSaved, onError }: RateFormModalProps) {
  const [professionalId, setProfessionalId] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [validFrom, setValidFrom] = useState(businessTodayStr());
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!professionalId || !hourlyRate || !validFrom) {
      onError('Preencha todos os campos.');
      return;
    }
    const rate = parseFloat(hourlyRate);
    if (isNaN(rate) || rate <= 0) {
      onError('Valor/hora inválido.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await hourlyRatesAPI.create({
        professional_id: professionalId,
        hourly_rate: rate,
        valid_from: validFrom,
        valid_until: null,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao criar taxa');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova Taxa"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="rate-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="rate-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Profissional *</label>
          <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="">Selecione...</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Valor/Hora (R$) *</label>
          <input type="number" step="0.01" min="0" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Válido a partir de *</label>
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
        <p className="text-xs text-app-muted">
          A taxa anterior vigente será automaticamente encerrada na data anterior ao início desta.
        </p>
      </form>
    </Modal>
  );
}

interface HourlyRateDetailsModalProps {
  rate: HourlyRateRow;
  onClose: () => void;
}

function HourlyRateDetailsModal({ rate, onClose }: HourlyRateDetailsModalProps) {
  const [history, setHistory] = useState<RateHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('hourly_rates')
          .select('id, hourly_rate, valid_from, valid_until')
          .eq('professional_id', rate.professional_id)
          .order('valid_from', { ascending: false });
        if (cancelled) return;
        setHistory((data as RateHistoryEntry[]) || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rate.professional_id]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  const currentRate = history.find((h) => h.valid_until === null) ?? null;

  return (
    <Modal open onClose={onClose} title="Detalhes do Valor/Hora" maxWidth="max-w-2xl">
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Profissional</p>
              <p className="text-sm text-app-primary font-medium">{rate.professional?.full_name || 'Desconhecido'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Taxa Atual</p>
              <p className="text-sm text-app-primary font-semibold">
                {currentRate ? formatCurrency(currentRate.hourly_rate) : '—'}
              </p>
            </div>
          </div>

          <div className="border-t border-app-primary pt-4">
            <h3 className="text-sm font-semibold text-app-primary mb-3">Histórico de Taxas</h3>
            {history.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-app-primary">
                <table className="w-full">
                  <thead className="bg-surface-secondary border-b border-app-primary">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-app-primary">Valor/Hora</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-app-primary">Válido de</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-app-primary">Válido até</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-app-primary">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-table-divider">
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="px-3 py-2 text-sm text-app-primary font-semibold">{formatCurrency(h.hourly_rate)}</td>
                        <td className="px-3 py-2 text-sm text-app-secondary">{formatDate(h.valid_from)}</td>
                        <td className="px-3 py-2 text-sm text-app-secondary">{h.valid_until ? formatDate(h.valid_until) : '—'}</td>
                        <td className="px-3 py-2 text-sm">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${h.valid_until ? 'bg-slate-100 text-slate-700 bg-surface-secondary text-app-secondary' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'}`}>
                            {h.valid_until ? 'Encerrada' : 'Vigente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-app-muted">Nenhum histórico disponível</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
