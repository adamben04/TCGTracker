import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { VaultCard as VaultCardType } from '../../../types/pokemon';
import { vaultService } from '../../../services/vaultService';
import { useGame } from '../../../contexts/GameContext';
import { VaultCard } from './VaultCard';
import { VaultPortfolioBySet } from './VaultPortfolioBySet';
import { VaultHeatmap } from './VaultHeatmap';
import { VaultPerformanceReport } from './VaultPerformanceReport';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { CountUp } from '../../../components/common/CountUp';
import {
  Vault,
  TrendingUp,
  TrendingDown,
  Download,
  Upload,
  Trash2,
  Camera,
  Search,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataProvenance } from '../../../components/ui/DataProvenance';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Surface } from '../../../components/ui/Surface';
import { authService } from '../../../services/authService';
import {
  getVaultSyncState,
  VAULT_SYNC_STATUS_EVENT,
  type VaultSyncState,
} from '../../../services/vaultSyncService';

interface VaultViewProps {
  onOpenSet?: (setId: string) => void;
}

export const VaultView: React.FC<VaultViewProps> = ({ onOpenSet }) => {
  const { game, isPokemon } = useGame();
  const { showToast } = useToast();
  const [vaultCards, setVaultCards] = useState<VaultCardType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [syncState, setSyncState] = useState<VaultSyncState>(() => getVaultSyncState());

  const loadVaultCards = useCallback(() => {
    setIsLoading(true);
    const cards = vaultService.getVaultCards(game);
    setVaultCards(cards);
    setIsLoading(false);
  }, [game]);

  useEffect(() => {
    loadVaultCards();

    const onVaultUpdated = () => loadVaultCards();
    window.addEventListener('tcg:vault-updated', onVaultUpdated);
    return () => window.removeEventListener('tcg:vault-updated', onVaultUpdated);
  }, [loadVaultCards]);

  useEffect(() => {
    const onSyncStatus = () => setSyncState(getVaultSyncState());
    window.addEventListener(VAULT_SYNC_STATUS_EVENT, onSyncStatus);
    return () => window.removeEventListener(VAULT_SYNC_STATUS_EVENT, onSyncStatus);
  }, []);

  const handleRemoveCard = (id: string) => {
    vaultService.removeFromVault(id, game);
    loadVaultCards();
  };

  const handleExport = () => {
    const data = vaultService.exportVault(game);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tcg-vault-${game}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            vaultService.importVault(content, game);
            loadVaultCards();
            showToast('Vault imported successfully!', 'success');
          } catch {
            showToast('Error importing vault: Invalid file format', 'error');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleClearVault = () => {
    setShowClearConfirm(true);
  };

  const handleClearConfirm = () => {
    vaultService.clearVault(game);
    loadVaultCards();
    setShowClearConfirm(false);
    showToast('Vault cleared successfully', 'info');
  };

  const stats = vaultService.getVaultStats(game);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const gain = stats.profit >= 0;
  const gameLabel = isPokemon ? 'Pokémon' : 'One Piece';

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title={`My ${gameLabel} vault`}
        description="Track holdings, cost basis, grading notes, and current estimated market value."
        actions={
          <>
            <Button onClick={handleExport} disabled={vaultCards.length === 0}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export
            </Button>
            <Button onClick={handleImport}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import
            </Button>
            {vaultCards.length > 0 ? (
              <Button variant="danger" onClick={handleClearVault}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear
              </Button>
            ) : null}
          </>
        }
        meta={
          <DataProvenance
            source={
              !authService.isAuthenticated()
                ? 'Stored on this device'
                : syncState.status === 'synced'
                  ? 'Account vault synced'
                  : syncState.status === 'syncing'
                    ? 'Syncing account vault'
                    : syncState.status === 'error'
                      ? 'Cloud sync paused — saved locally'
                      : 'Account vault awaiting sync'
            }
            qualifier="Market values are estimates; condition and finish affect realized price."
          />
        }
      />

      {authService.isAuthenticated() && syncState.status === 'error' ? (
        <div
          className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-ink-primary"
          role="alert"
        >
          {syncState.message ?? 'Cloud sync is unavailable. Changes remain saved locally.'}
        </div>
      ) : null}

      {vaultCards.length > 0 ? (
        <Surface className="mt-5 grid gap-4 p-5 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <p className="text-xs font-medium text-ink-muted">Current value</p>
            <p className="mt-2 font-mono text-3xl font-semibold leading-tight tabular-nums text-ink-primary">
              <CountUp end={stats.currentValue} prefix="$" decimals={2} />
            </p>
            <p
              className={`mt-2 inline-flex items-center gap-1 text-sm font-medium tabular-nums ${
                gain ? 'text-gain' : 'text-loss'
              }`}
            >
              {gain ? (
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
              )}
              {stats.profit >= 0 ? '+' : ''}
              <CountUp end={Math.abs(stats.profit)} prefix="$" decimals={2} />
              {' · '}
              {stats.profitPercentage >= 0 ? '+' : ''}
              {stats.profitPercentage.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-muted">Cost basis</p>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink-primary">
              <CountUp end={stats.totalValue} prefix="$" decimals={2} />
            </p>
            <p className="mt-1 text-xs text-ink-muted">Recorded purchase value</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-muted">Cards held</p>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink-primary">
              <CountUp end={stats.totalCards} />
            </p>
            <p className="mt-1 text-xs text-ink-muted">{vaultCards.length} vault entries</p>
          </div>
        </Surface>
      ) : null}

      {/* Empty State */}
      {vaultCards.length === 0 ? (
        <Surface className="mt-6 flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-accent/25 bg-accent-muted">
            <Vault className="h-7 w-7 text-accent" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-ink-primary">Your vault is empty</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
            {isPokemon
              ? 'Scan your first card or browse the marketplace to start building your collection.'
              : 'Browse One Piece cards to add your first entry.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {isPokemon && (
              <Link to="/scanner" className="btn-secondary">
                <Camera className="h-5 w-5" aria-hidden="true" />
                Scan a card
              </Link>
            )}
            <Link to="/browse" className="btn-primary">
              <Search className="h-5 w-5" aria-hidden="true" />
              Browse {gameLabel} cards
            </Link>
          </div>
        </Surface>
      ) : (
        <div className="space-y-8">
          <VaultPerformanceReport vaultCards={vaultCards} />
          {isPokemon && (
            <>
              <VaultHeatmap vaultCards={vaultCards} onOpenSet={onOpenSet} />
              <VaultPortfolioBySet vaultCards={vaultCards} onOpenSet={onOpenSet} />
            </>
          )}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink-primary">
                Holdings{' '}
                <span className="text-sm font-normal tabular-nums text-ink-muted">
                  ({vaultCards.length})
                </span>
              </h2>
            </div>
            <div className="stagger-children space-y-4">
              {vaultCards.map((vaultCard) => (
                <VaultCard
                  key={vaultCard.id}
                  vaultCard={vaultCard}
                  onRemove={handleRemoveCard}
                  onUpdate={loadVaultCards}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showClearConfirm}
        onConfirm={handleClearConfirm}
        onCancel={() => setShowClearConfirm(false)}
        title="Clear vault?"
        message="Are you sure you want to clear your entire vault? This cannot be undone!"
        confirmLabel="Clear vault"
        variant="destructive"
      />
    </>
  );
};
