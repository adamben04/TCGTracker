import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Download, TrendingUp, TrendingDown, Receipt, Scale } from 'lucide-react';
import { useGame } from '../../../contexts/GameContext';
import {
  Transaction,
  TransactionType,
  LedgerSummary,
  fetchTransactions,
  addTransaction,
  deleteTransaction,
  exportLedgerCsvUrl,
} from '../../../services/collectionToolsApi';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { formatCurrency } from '../../../utils/cardDisplay';

const TYPE_LABELS: Record<TransactionType, string> = {
  buy: 'Buy',
  sell: 'Sell',
  trade_in: 'Trade (in)',
  trade_out: 'Trade (out)',
};

const TYPE_COLORS: Record<TransactionType, string> = {
  buy: 'bg-sky-500/10 text-sky-400',
  sell: 'bg-emerald-500/10 text-emerald-400',
  trade_in: 'bg-amber-500/10 text-amber-400',
  trade_out: 'bg-purple-500/10 text-purple-400',
};

interface FormState {
  type: TransactionType;
  cardName: string;
  quantity: number;
  priceEach: string;
  fees: string;
  date: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  type: 'buy',
  cardName: '',
  quantity: 1,
  priceEach: '',
  fees: '0',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
};

export const TransactionsLedger: React.FC = () => {
  const { game, isPokemon } = useGame();
  const [items, setItems] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTransactions();
      setItems(data.items);
      setSummary(data.summary);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const result = await addTransaction({
        type: form.type,
        cardName: form.cardName.trim(),
        game,
        quantity: form.quantity,
        priceEach: Number(form.priceEach) || 0,
        fees: form.fees ? Number(form.fees) : 0,
        transactionDate: form.date,
        notes: form.notes.trim() || undefined,
      });
      setItems((prev) => [result.item, ...prev]);
      setSummary(result.summary);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      const updatedSummary = await deleteTransaction(id);
      setItems((prev) => prev.filter((t) => t.id !== id));
      setSummary(updatedSummary);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete transaction');
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent/50 focus:outline-none';

  const gameLabel = isPokemon ? 'Pokemon' : 'One Piece';
  const profit = (summary?.realizedProfitLoss ?? 0) >= 0;

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionLabel className="text-accent/90">Transactions</SectionLabel>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-primary">
            {gameLabel} Ledger
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Log buys, sells and trades to track your realized profit and loss.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={exportLedgerCsvUrl()}
            download
            className={`btn-secondary gap-2 ${items.length === 0 ? 'pointer-events-none opacity-50' : ''}`}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
          <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-primary gap-2">
            <Plus className="h-4 w-4" />
            {showForm ? 'Close' : 'Add entry'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border-default bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Type
              </label>
              <select
                className={inputClass}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as TransactionType })}
              >
                {(Object.keys(TYPE_LABELS) as TransactionType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Card name *
              </label>
              <input
                className={inputClass}
                value={form.cardName}
                onChange={(e) => setForm({ ...form, cardName: e.target.value })}
                placeholder="e.g. Charizard ex 151 #199"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Date
              </label>
              <input
                className={inputClass}
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Quantity
              </label>
              <input
                className={inputClass}
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Price each ($)
              </label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                value={form.priceEach}
                onChange={(e) => setForm({ ...form, priceEach: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Fees ($, optional)
              </label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                value={form.fees}
                onChange={(e) => setForm({ ...form, fees: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Notes
              </label>
              <input
                className={inputClass}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional - e.g. sold on TCGplayer after fees"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="btn-primary gap-2" disabled={saving}>
              <Plus className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save entry'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {summary && summary.count > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border-default bg-surface p-4">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Receipt className="h-4 w-4 text-accent" />
              Invested
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-ink-primary">
              {formatCurrency(summary.totalInvested)}
            </div>
            <div className="text-xs text-ink-muted">{summary.buyCount} buy/trade-out entries</div>
          </div>
          <div className="rounded-2xl border border-border-default bg-surface p-4">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Scale className="h-4 w-4 text-accent" />
              Revenue
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-ink-primary">
              {formatCurrency(summary.totalRevenue)}
            </div>
            <div className="text-xs text-ink-muted">
              {summary.sellCount} sell/trade-in entries
              {summary.totalFees > 0 ? ` · ${formatCurrency(summary.totalFees)} fees` : ''}
            </div>
          </div>
          <div className="rounded-2xl border border-border-default bg-surface p-4">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              {profit ? (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )}
              Realized P&L
            </div>
            <div
              className={`mt-1 font-display text-2xl font-bold ${
                profit ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {summary.realizedProfitLoss >= 0 ? '+' : ''}
              {formatCurrency(summary.realizedProfitLoss)}
            </div>
            <div className="text-xs text-ink-muted">{summary.count} total entries</div>
          </div>
          <div className="rounded-2xl border border-border-default bg-surface p-4">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <TrendingUp className="h-4 w-4 text-accent" />
              Return
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-ink-primary">
              {summary.realizedProfitLossPercentage >= 0 ? '+' : ''}
              {summary.realizedProfitLossPercentage.toFixed(1)}%
            </div>
            <div className="text-xs text-ink-muted">on total invested</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-ink-muted">Loading ledger...</div>
      ) : items.length === 0 ? (
        <PageEmptyState
          icon={Receipt}
          title="No transactions yet"
          message="Log your first buy or sell to start building your realized P&L report."
          action={
            <button type="button" className="btn-primary gap-2" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Add first entry
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-default bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-default text-xs uppercase tracking-wider text-ink-muted">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Card</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Price</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const total = t.price_each * t.quantity - (t.fees || 0);
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-border-default/60 last:border-0 hover:bg-surface-inset/50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                        {t.transaction_date}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_COLORS[t.type]}`}>
                          {TYPE_LABELS[t.type]}
                        </span>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <div className="truncate text-ink-primary">{t.card_name}</div>
                        {t.notes && <div className="truncate text-xs text-ink-muted">{t.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary">{t.quantity}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-secondary">
                        {formatCurrency(t.price_each)}
                        {t.fees > 0 && (
                          <div className="text-xs text-ink-muted">+{formatCurrency(t.fees)} fees</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink-primary">
                        {formatCurrency(total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id)}
                          className="rounded-lg p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-400"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
