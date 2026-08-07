import { Database } from 'sqlite3';
import { allDbRows, getDbRow, runDb } from '../utils/dbAsync';

export type VaultGame = 'pokemon' | 'onepiece';

export const VAULT_GAMES: VaultGame[] = ['pokemon', 'onepiece'];

export interface PortfolioItem {
  id: number;
  user_id: number;
  card_id: string;
  card_name: string;
  quantity: number;
  purchase_price?: number;
  purchase_date?: string;
  condition?: string;
  notes?: string;
  card_data?: string | null;
  client_vault_id?: string | null;
  game: VaultGame;
  client_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultSyncEntry {
  id: string;
  card: unknown;
  purchasePrice: number;
  purchaseDate: string;
  quantity: number;
  condition: string;
  notes?: string;
  game?: string;
  updatedAt?: string;
}

export interface VaultSyncOptions {
  /**
   * Games the payload is authoritative for. Rows belonging to games outside this
   * scope are never touched, so saving a Pokemon card can no longer wipe the
   * One Piece collection.
   */
  games?: string[];
}

export interface PortfolioStats {
  totalCards: number;
  totalValue: number;
  totalInvestment: number;
  profitLoss: number;
  profitLossPercentage: number;
  topGainers: Array<{ card_name: string; gain: number; gainPercentage: number }>;
  topLosers: Array<{ card_name: string; loss: number; lossPercentage: number }>;
}

export function normalizeGame(game?: string | null): VaultGame {
  return game === 'onepiece' ? 'onepiece' : 'pokemon';
}

/** Returns true when `candidate` is strictly older than `existing`. */
function isStaleUpdate(candidate?: string | null, existing?: string | null): boolean {
  if (!candidate || !existing) return false;
  const candidateTime = Date.parse(candidate);
  const existingTime = Date.parse(existing);
  if (Number.isNaN(candidateTime) || Number.isNaN(existingTime)) return false;
  return candidateTime < existingTime;
}

export class PortfolioService {
  /**
   * sqlite3 shares a single connection, so overlapping `BEGIN IMMEDIATE`
   * transactions would fail with "cannot start a transaction within a
   * transaction". Sync requests are therefore serialized in-process.
   */
  private syncQueue: Promise<unknown> = Promise.resolve();

  constructor(private db: Database) {}

  private enqueueSync<T>(task: () => Promise<T>): Promise<T> {
    const result = this.syncQueue.then(task, task);
    this.syncQueue = result.catch(() => undefined);
    return result;
  }

  async addToCollection(
    userId: number,
    cardId: string,
    cardName: string,
    quantity = 1,
    purchasePrice?: number,
    purchaseDate?: string,
    condition?: string,
    notes?: string,
    cardData?: string,
    clientVaultId?: string,
    game?: string
  ): Promise<PortfolioItem> {
    const resolvedGame = normalizeGame(game);

    if (clientVaultId) {
      await runDb(
        this.db,
        `INSERT INTO user_collections
           (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id, game)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, client_vault_id) DO UPDATE SET
           card_id = excluded.card_id,
           card_name = excluded.card_name,
           quantity = excluded.quantity,
           purchase_price = excluded.purchase_price,
           purchase_date = excluded.purchase_date,
           condition = excluded.condition,
           notes = excluded.notes,
           card_data = excluded.card_data,
           game = excluded.game,
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          cardId,
          cardName,
          quantity,
          purchasePrice ?? null,
          purchaseDate ?? null,
          condition ?? null,
          notes ?? null,
          cardData ?? null,
          clientVaultId,
          resolvedGame,
        ]
      );

      const upserted = await getDbRow<PortfolioItem>(
        this.db,
        'SELECT * FROM user_collections WHERE user_id = ? AND client_vault_id = ?',
        [userId, clientVaultId]
      );
      if (!upserted) throw new Error('Failed to load upserted portfolio item');
      return upserted;
    }

    const existing = await getDbRow<{ id: number }>(
      this.db,
      `SELECT id FROM user_collections
        WHERE user_id = ? AND card_id = ? AND IFNULL(condition, '') = IFNULL(?, '')
          AND client_vault_id IS NULL
        ORDER BY id LIMIT 1`,
      [userId, cardId, condition ?? null]
    );

    if (existing) {
      await runDb(
        this.db,
        `UPDATE user_collections SET
           card_name = ?, quantity = ?, purchase_price = ?, purchase_date = ?,
           condition = ?, notes = ?, card_data = ?, game = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          cardName,
          quantity,
          purchasePrice ?? null,
          purchaseDate ?? null,
          condition ?? null,
          notes ?? null,
          cardData ?? null,
          resolvedGame,
          existing.id,
          userId,
        ]
      );
      const updated = await this.getItemById(existing.id, userId);
      if (!updated) throw new Error('Failed to load updated portfolio item');
      return updated;
    }

    const { lastID } = await runDb(
      this.db,
      `INSERT INTO user_collections
         (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id, game)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        cardId,
        cardName,
        quantity,
        purchasePrice ?? null,
        purchaseDate ?? null,
        condition ?? null,
        notes ?? null,
        cardData ?? null,
        clientVaultId ?? null,
        resolvedGame,
      ]
    );

    const row = await this.getItemById(lastID, userId);
    if (!row) throw new Error('Failed to load created portfolio item');
    return row;
  }

  async getItemById(itemId: number, userId: number): Promise<PortfolioItem | undefined> {
    return getDbRow<PortfolioItem>(
      this.db,
      'SELECT * FROM user_collections WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
  }

  async getCollection(userId: number, game?: string): Promise<PortfolioItem[]> {
    if (game) {
      return allDbRows<PortfolioItem>(
        this.db,
        'SELECT * FROM user_collections WHERE user_id = ? AND game = ? ORDER BY created_at DESC, id DESC',
        [userId, normalizeGame(game)]
      );
    }
    return allDbRows<PortfolioItem>(
      this.db,
      'SELECT * FROM user_collections WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [userId]
    );
  }

  /**
   * Reconciles a client vault snapshot into the user's collection.
   *
   * - Rows are matched on the stable `client_vault_id`, never rebuilt from scratch.
   * - An entry whose `updatedAt` is older than the stored value is ignored, so a
   *   stale tab cannot roll back a newer write.
   * - Deletions only apply inside the synced game scope, and only to rows that
   *   originated from a client vault (manual API additions are preserved).
   * - Runs in a single IMMEDIATE transaction, so both games move atomically.
   */
  async syncVault(
    userId: number,
    cards: VaultSyncEntry[],
    options: VaultSyncOptions = {}
  ): Promise<PortfolioItem[]> {
    return this.enqueueSync(() => this.syncVaultInternal(userId, cards, options));
  }

  private async syncVaultInternal(
    userId: number,
    cards: VaultSyncEntry[],
    options: VaultSyncOptions
  ): Promise<PortfolioItem[]> {
    // Last entry wins for duplicate ids so the sync is deterministic.
    const deduped = new Map<string, VaultSyncEntry>();
    for (const entry of cards) {
      if (!entry?.id) continue;
      deduped.set(entry.id, entry);
    }
    const entries = Array.from(deduped.values());

    const scope = new Set<VaultGame>(
      (options.games && options.games.length > 0
        ? options.games
        : entries.map((e) => e.game ?? 'pokemon')
      ).map(normalizeGame)
    );

    await runDb(this.db, 'BEGIN IMMEDIATE');
    try {
      const existingRows = await allDbRows<{
        client_vault_id: string;
        client_updated_at: string | null;
      }>(
        this.db,
        'SELECT client_vault_id, client_updated_at FROM user_collections WHERE user_id = ? AND client_vault_id IS NOT NULL',
        [userId]
      );
      const existingByVaultId = new Map(existingRows.map((r) => [r.client_vault_id, r]));

      for (const entry of entries) {
        const previous = existingByVaultId.get(entry.id);
        if (previous && isStaleUpdate(entry.updatedAt, previous.client_updated_at)) continue;

        const card = entry.card as { id?: string; name?: string } | undefined;
        const game = normalizeGame(entry.game);
        await runDb(
          this.db,
          `INSERT INTO user_collections
             (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id, game, client_updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, client_vault_id) DO UPDATE SET
             card_id = excluded.card_id,
             card_name = excluded.card_name,
             quantity = excluded.quantity,
             purchase_price = excluded.purchase_price,
             purchase_date = excluded.purchase_date,
             condition = excluded.condition,
             notes = excluded.notes,
             card_data = excluded.card_data,
             game = excluded.game,
             client_updated_at = excluded.client_updated_at,
             updated_at = CURRENT_TIMESTAMP`,
          [
            userId,
            card?.id || entry.id,
            card?.name || 'Unknown',
            entry.quantity,
            entry.purchasePrice,
            entry.purchaseDate,
            entry.condition,
            entry.notes ?? null,
            JSON.stringify({ ...entry, game }),
            entry.id,
            game,
            entry.updatedAt ?? null,
          ]
        );
      }

      if (scope.size > 0) {
        const scopedGames = Array.from(scope);
        const keptIds = entries.map((e) => e.id);
        const gamePlaceholders = scopedGames.map(() => '?').join(', ');
        const idPlaceholders = keptIds.map(() => '?').join(', ');
        await runDb(
          this.db,
          `DELETE FROM user_collections
            WHERE user_id = ?
              AND client_vault_id IS NOT NULL
              AND game IN (${gamePlaceholders})
              ${keptIds.length > 0 ? `AND client_vault_id NOT IN (${idPlaceholders})` : ''}`,
          [userId, ...scopedGames, ...keptIds]
        );
      }

      await runDb(this.db, 'COMMIT');
    } catch (error) {
      await runDb(this.db, 'ROLLBACK');
      throw error;
    }

    return this.getCollection(userId);
  }

  async updateItem(
    itemId: number,
    userId: number,
    updates: Partial<Omit<PortfolioItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<void> {
    const allowed = new Set([
      'card_id',
      'card_name',
      'quantity',
      'purchase_price',
      'purchase_date',
      'condition',
      'notes',
      'card_data',
      'client_vault_id',
      'game',
      'client_updated_at',
    ]);

    const fields: string[] = [];
    const values: unknown[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && allowed.has(key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'game' ? normalizeGame(value as string) : value);
      }
    });

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(itemId, userId);

    await runDb(
      this.db,
      `UPDATE user_collections SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
  }

  async removeFromCollection(itemId: number, userId: number): Promise<void> {
    await runDb(this.db, 'DELETE FROM user_collections WHERE id = ? AND user_id = ?', [
      itemId,
      userId,
    ]);
  }

  async getPortfolioStats(userId: number, game?: string): Promise<PortfolioStats> {
    const collection = await this.getCollection(userId, game);

    let totalCards = 0;
    let totalInvestment = 0;
    let totalValue = 0;

    const cardPerformance: Array<{ card_name: string; gain: number; gainPercentage: number }> = [];

    collection.forEach((item) => {
      totalCards += item.quantity;
      const purchasePrice = item.purchase_price || 0;
      totalInvestment += purchasePrice * item.quantity;

      let currentPrice = purchasePrice;
      if (item.card_data) {
        try {
          const parsed = JSON.parse(item.card_data) as VaultSyncEntry;
          const market = (parsed.card as { marketPrice?: number })?.marketPrice;
          if (market && market > 0) currentPrice = market;
        } catch {
          /* use purchase price */
        }
      }

      totalValue += currentPrice * item.quantity;
      const gain = (currentPrice - purchasePrice) * item.quantity;
      const gainPercentage =
        purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;

      cardPerformance.push({ card_name: item.card_name, gain, gainPercentage });
    });

    const profitLoss = totalValue - totalInvestment;
    const profitLossPercentage = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;

    cardPerformance.sort((a, b) => b.gainPercentage - a.gainPercentage);

    return {
      totalCards,
      totalValue,
      totalInvestment,
      profitLoss,
      profitLossPercentage,
      topGainers: cardPerformance.filter((p) => p.gain > 0).slice(0, 5),
      topLosers: cardPerformance
        .filter((p) => p.gain < 0)
        .map((p) => ({
          card_name: p.card_name,
          loss: Math.abs(p.gain),
          lossPercentage: Math.abs(p.gainPercentage),
        }))
        .slice(0, 5),
    };
  }
}
