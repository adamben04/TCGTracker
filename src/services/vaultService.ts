import { VaultCard, VaultStats, PokemonCard, CardCondition } from '../types/pokemon';
import { scheduleVaultSync } from './vaultSyncService';
import {
  VaultGame,
  clearTombstones,
  getActiveScope,
  migrateLegacyVaultKeys,
  normalizeGame,
  notifyVaultUpdated,
  readVault,
  recordTombstones,
  writeVault,
} from './vaultStorage';

const CARD_CONDITIONS = new Set<CardCondition>([
  'raw',
  'near-mint',
  'lightly-played',
  'moderately-played',
  'heavily-played',
  'damaged',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseImportedVaultCard(
  value: unknown,
  index: number,
  game: VaultGame,
  fallbackUpdatedAt: string
): VaultCard {
  if (!isRecord(value) || !isRecord(value.card)) {
    throw new Error(`Vault entry ${index + 1} is not an object with card data`);
  }

  const quantity = Number(value.quantity);
  const purchasePrice = Number(value.purchasePrice);
  const condition = value.condition;
  const purchaseDate = value.purchaseDate;

  if (typeof value.id !== 'string' || value.id.trim() === '') {
    throw new Error(`Vault entry ${index + 1} is missing a stable id`);
  }
  if (
    typeof value.card.id !== 'string' ||
    value.card.id.trim() === '' ||
    typeof value.card.name !== 'string' ||
    value.card.name.trim() === ''
  ) {
    throw new Error(`Vault entry ${index + 1} has invalid card data`);
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Vault entry ${index + 1} has an invalid quantity`);
  }
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    throw new Error(`Vault entry ${index + 1} has an invalid purchase price`);
  }
  if (typeof purchaseDate !== 'string' || Number.isNaN(Date.parse(purchaseDate))) {
    throw new Error(`Vault entry ${index + 1} has an invalid purchase date`);
  }
  if (typeof condition !== 'string' || !CARD_CONDITIONS.has(condition as CardCondition)) {
    throw new Error(`Vault entry ${index + 1} has an invalid condition`);
  }
  if (value.notes !== undefined && typeof value.notes !== 'string') {
    throw new Error(`Vault entry ${index + 1} has invalid notes`);
  }

  return {
    card: value.card as unknown as PokemonCard,
    id: value.id,
    purchasePrice,
    purchaseDate,
    quantity,
    condition: condition as CardCondition,
    notes: value.notes as string | undefined,
    game,
    updatedAt: fallbackUpdatedAt,
    gradingResult: isRecord(value.gradingResult)
      ? (value.gradingResult as VaultCard['gradingResult'])
      : undefined,
  };
}

class VaultService {
  private legacyMigrated = false;

  private ensureMigrated(): void {
    if (this.legacyMigrated) return;
    this.legacyMigrated = true;
    migrateLegacyVaultKeys();
  }

  // Get all vault cards for a specific game
  getVaultCards(game?: VaultGame): VaultCard[] {
    try {
      this.ensureMigrated();
      return readVault(normalizeGame(game), getActiveScope());
    } catch (error) {
      console.error('Error loading vault cards:', error);
      return [];
    }
  }

  // Add a card to the vault
  addToVault(
    card: PokemonCard,
    purchasePrice: number,
    quantity: number = 1,
    condition: CardCondition = 'raw',
    notes?: string,
    game: VaultGame = 'pokemon'
  ): VaultCard {
    const resolvedGame = normalizeGame(game);
    const vaultCards = this.getVaultCards(resolvedGame);
    const now = new Date().toISOString();

    const vaultCard: VaultCard = {
      id: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      card,
      purchasePrice,
      purchaseDate: now,
      quantity,
      condition,
      notes,
      game: resolvedGame,
      updatedAt: now,
    };

    vaultCards.push(vaultCard);
    this.saveVaultCards(vaultCards, resolvedGame);

    return vaultCard;
  }

  // Update a vault card
  updateVaultCard(
    id: string,
    updates: Partial<Omit<VaultCard, 'id' | 'card'>>,
    game?: VaultGame
  ): void {
    const resolvedGame = normalizeGame(game);
    const vaultCards = this.getVaultCards(resolvedGame);
    const index = vaultCards.findIndex((vc) => vc.id === id);

    if (index !== -1) {
      vaultCards[index] = {
        ...vaultCards[index],
        ...updates,
        game: resolvedGame,
        updatedAt: new Date().toISOString(),
      };
      this.saveVaultCards(vaultCards, resolvedGame);
    }
  }

  // Remove a card from the vault
  removeFromVault(id: string, game?: VaultGame): void {
    const resolvedGame = normalizeGame(game);
    const vaultCards = this.getVaultCards(resolvedGame);
    const filtered = vaultCards.filter((vc) => vc.id !== id);
    if (filtered.length === vaultCards.length) return;

    recordTombstones([id], getActiveScope());
    this.saveVaultCards(filtered, resolvedGame);
  }

  // Get vault statistics
  getVaultStats(game?: VaultGame): VaultStats {
    const vaultCards = this.getVaultCards(game);

    const totalCards = vaultCards.reduce((sum, vc) => sum + vc.quantity, 0);
    const totalValue = vaultCards.reduce((sum, vc) => sum + vc.purchasePrice * vc.quantity, 0);

    // Calculate current value using market prices
    const currentValue = vaultCards.reduce((sum, vc) => {
      const marketPrice = vc.card.marketPrice || this.extractCardPrice(vc.card);
      return sum + marketPrice * vc.quantity;
    }, 0);

    const profit = currentValue - totalValue;
    const profitPercentage = totalValue > 0 ? (profit / totalValue) * 100 : 0;

    return {
      totalCards,
      totalValue,
      currentValue,
      profit,
      profitPercentage,
    };
  }

  // Check if a card is in the vault
  isInVault(cardId: string, game?: VaultGame): boolean {
    return this.getVaultCards(game).some((vc) => vc.card.id === cardId);
  }

  // Get all vault entries for a specific card
  getVaultEntriesForCard(cardId: string, game?: VaultGame): VaultCard[] {
    return this.getVaultCards(game).filter((vc) => vc.card.id === cardId);
  }

  // Private helper to save vault cards for a single game.
  // Only the target game's bucket is rewritten; the sync push always carries the
  // complete multi-game snapshot so the other game is never dropped server side.
  private saveVaultCards(vaultCards: VaultCard[], game?: VaultGame): void {
    try {
      writeVault(normalizeGame(game), vaultCards, getActiveScope());
      notifyVaultUpdated();
      scheduleVaultSync();
    } catch (error) {
      console.error('Error saving vault cards:', error);
    }
  }

  // Helper to extract price from card (copied from pokemonApi)
  private extractCardPrice(card: PokemonCard): number {
    // Try TCGPlayer first
    if (card.tcgplayer?.prices) {
      const prices = card.tcgplayer.prices;

      // Priority order for price variants
      const variants = [
        'normal',
        'holofoil',
        '1stEditionHolofoil',
        '1stEditionNormal',
        'unlimited',
      ];

      for (const variant of variants) {
        if (prices[variant]?.market) {
          return prices[variant].market!;
        }
      }
    }

    return 0;
  }

  // Clear entire vault for a game (useful for testing)
  clearVault(game?: VaultGame): void {
    const resolvedGame = normalizeGame(game);
    const existing = this.getVaultCards(resolvedGame);
    recordTombstones(
      existing.map((vc) => vc.id),
      getActiveScope()
    );
    this.saveVaultCards([], resolvedGame);
  }

  // Export vault data as JSON
  exportVault(game?: VaultGame): string {
    return JSON.stringify(this.getVaultCards(game), null, 2);
  }

  // Import vault data from JSON
  importVault(jsonData: string, game?: VaultGame): void {
    try {
      const parsed = JSON.parse(jsonData) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Vault data must be an array');
      const resolvedGame = normalizeGame(game);
      const now = new Date().toISOString();
      const vaultCards = parsed.map((card, index) =>
        parseImportedVaultCard(card, index, resolvedGame, now)
      );
      clearTombstones(
        vaultCards.map((card) => card.id),
        getActiveScope()
      );
      this.saveVaultCards(vaultCards, resolvedGame);
    } catch (error) {
      console.error('Error importing vault data:', error);
      throw new Error('Invalid vault data format');
    }
  }
}

export const vaultService = new VaultService();
