import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Boxes } from 'lucide-react';
import { useGame } from '../../../contexts/GameContext';
import {
  SealedProduct,
  fetchSealedProducts,
  addSealedProduct,
  updateSealedProduct,
  deleteSealedProduct,
} from '../../../services/collectionToolsApi';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { formatCurrency } from '../../../utils/cardDisplay';

const PRODUCT_TYPES = [
  'booster_box',
  'elite_trainer_box',
  'booster_bundle',
  'booster_pack',
  'collection_box',
  'tin',
  'premium_collection',
  'blister',
  'other',
] as const;

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  booster_box: 'Booster Box',
  elite_trainer_box: 'Elite Trainer Box',
  booster_bundle: 'Booster Bundle',
  booster_pack: 'Booster Pack',
  collection_box: 'Collection Box',
  tin: 'Tin',
  premium_collection: 'Premium Collection',
  blister: 'Blister',
  other: 'Other',
};

interface FormState {
  name: string;
  productType: string;
  setName: string;
  quantity: number;
  purchasePrice: number;
  currentValue: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  productType: 'booster_box',
  setName: '',
  quantity: 1,
  purchasePrice: 0,
  currentValue: '',
  notes: '',
};

export const SealedProductsView: React.FC = () => {
  const { game, isPokemon } = useGame();
  const [items, setItems] = useState<SealedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [pendingDeletion, setPendingDeletion] = useState<number | null>(null);
  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const load = useCallback(async () => {
    try {
      const sealed = await fetchSealedProducts();
      setItems(sealed.filter((s) => s.game === game));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load sealed products'));
    } finally {
      setLoading(false);
    }
  }, [game]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalValue = useMemo(() => {
    return items.reduce(
      (sum, item) => sum + (item.current_value ?? item.purchase_price) * item.quantity,
      0
    );
  }, [items]);

  const totalInvestment = useMemo(() => {
    return items.reduce((sum, item) => sum + item.purchase_price * item.quantity, 0);
  }, [items]);

  const profit = totalValue - totalInvestment;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        game,
        productType: form.productType,
        setName: form.setName.trim() || undefined,
        quantity: form.quantity,
        purchasePrice: form.purchasePrice,
        currentValue: form.currentValue ? Number(form.currentValue) : undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editingId) {
        await updateSealedProduct(editingId, payload);
      } else {
        await addSealedProduct(payload);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save product'));
    }
  };

  const handleEdit = (item: SealedProduct) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      productType: item.product_type,
      setName: item.set_name ?? '',
      quantity: item.quantity,
      purchasePrice: item.purchase_price,
      currentValue: item.current_value != null ? String(item.current_value) : '',
      notes: item.notes ?? '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id: number) => {
    setPendingDeletion(id);
  };

  const confirmDelete = async () => {
    if (pendingDeletion === null) return;
    try {
      await deleteSealedProduct(pendingDeletion);
      setPendingDeletion(null);
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete product'));
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent/50 focus:outline-none';

  const gameLabel = isPokemon ? 'Pokemon' : 'One Piece';

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionLabel className="text-accent/90">Sealed products</SectionLabel>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-primary">
            {gameLabel} Sealed
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Track booster boxes, ETBs and other sealed products you hold.
          </p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-primary gap-2">
          <Plus className="h-4 w-4" />
          {showForm ? 'Close' : 'Add product'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border-default bg-surface p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <label
                htmlFor="sealed-name"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
              >
                Product name *
              </label>
              <input
                className={inputClass}
                id="sealed-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Surging Sparks Booster Box"
                required
              />
            </div>
            <div>
              <label
                htmlFor="sealed-type"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
              >
                Type
              </label>
              <select
                className={inputClass}
                id="sealed-type"
                value={form.productType}
                onChange={(e) => setForm({ ...form, productType: e.target.value })}
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PRODUCT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="sealed-set-name"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
              >
                Set (optional)
              </label>
              <input
                className={inputClass}
                id="sealed-set-name"
                value={form.setName}
                onChange={(e) => setForm({ ...form, setName: e.target.value })}
                placeholder="e.g. Surging Sparks"
              />
            </div>
            <div>
              <label
                htmlFor="sealed-quantity"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
              >
                Quantity
              </label>
              <input
                className={inputClass}
                id="sealed-quantity"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </div>
            <div>
              <label
                htmlFor="sealed-purchase-price"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
              >
                Purchase price (each)
              </label>
              <input
                className={inputClass}
                id="sealed-purchase-price"
                type="number"
                min={0}
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label
                htmlFor="sealed-current-value"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
              >
                Current value (each, optional)
              </label>
              <input
                className={inputClass}
                id="sealed-current-value"
                type="number"
                min={0}
                step="0.01"
                value={form.currentValue}
                onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                placeholder="Leave blank to use purchase price"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label
                htmlFor="sealed-notes"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
              >
                Notes
              </label>
              <input
                className={inputClass}
                id="sealed-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="btn-primary gap-2">
              {editingId ? 'Save changes' : 'Add to sealed'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border-default bg-surface p-4">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Boxes className="h-4 w-4 text-accent" />
              Cost basis
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-ink-primary">
              {formatCurrency(totalInvestment)}
            </div>
            <div className="text-xs text-ink-muted">{items.length} item(s)</div>
          </div>
          <div className="rounded-2xl border border-border-default bg-surface p-4">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Package className="h-4 w-4 text-accent" />
              Market value
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-ink-primary">
              {formatCurrency(totalValue)}
            </div>
            <div className="text-xs text-ink-muted">using current values where set</div>
          </div>
          <div className="rounded-2xl border border-border-default bg-surface p-4">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              {profit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )}
              Profit / Loss
            </div>
            <div
              className={`mt-1 font-display text-2xl font-bold ${
                profit >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {profit >= 0 ? '+' : ''}
              {formatCurrency(profit)}
            </div>
            <div className="text-xs text-ink-muted">
              {totalInvestment > 0
                ? `${profit >= 0 ? '+' : ''}${((profit / totalInvestment) * 100).toFixed(1)}%`
                : 'no cost basis'}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-ink-muted">Loading sealed products…</div>
      ) : items.length === 0 ? (
        <PageEmptyState
          icon={Package}
          title="No sealed products tracked"
          message="Add booster boxes, ETBs and other sealed product to track your unopened investments."
          action={
            <button type="button" className="btn-primary gap-2" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Add your first product
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const valueEach = item.current_value ?? item.purchase_price;
            const itemValue = valueEach * item.quantity;
            const itemProfit = itemValue - item.purchase_price * item.quantity;
            return (
              <div
                key={item.id}
                className="group rounded-2xl border border-border-default bg-surface p-4 transition-colors hover:border-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink-primary">{item.name}</div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {PRODUCT_TYPE_LABELS[item.product_type] ?? item.product_type}
                      {item.set_name ? ` · ${item.set_name}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-inset hover:text-ink-primary"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-400"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-xs text-ink-muted">
                      {item.quantity} × {formatCurrency(valueEach)}
                    </div>
                    <div className="mt-1 font-display text-xl font-bold text-ink-primary">
                      {formatCurrency(itemValue)}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      itemProfit >= 0
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {itemProfit >= 0 ? '+' : ''}
                    {formatCurrency(itemProfit)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        isOpen={pendingDeletion !== null}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeletion(null)}
        title="Remove sealed product?"
        message="This sealed product will be permanently removed from your collection."
        confirmLabel="Remove"
        variant="destructive"
      />
    </div>
  );
};
