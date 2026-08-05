import { Database } from 'sqlite3';
import { allDbRows, getDbRow, runDb } from '../utils/dbAsync';

export interface SealedProduct {
  id: number;
  user_id: number;
  name: string;
  game: 'pokemon' | 'onepiece';
  product_type: string;
  set_name?: string;
  quantity: number;
  purchase_price: number;
  current_value?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SealedProductInput {
  name: string;
  game: 'pokemon' | 'onepiece';
  productType: string;
  setName?: string;
  quantity: number;
  purchasePrice: number;
  currentValue?: number;
  notes?: string;
}

export interface SealedStats {
  itemCount: number;
  totalInvestment: number;
  totalValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  byType: Record<string, { count: number; value: number; investment: number }>;
}

export class SealedProductService {
  constructor(private db: Database) {}

  async list(userId: number): Promise<SealedProduct[]> {
    return allDbRows<SealedProduct>(
      this.db,
      'SELECT * FROM sealed_products WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  async add(userId: number, input: SealedProductInput): Promise<SealedProduct> {
    const { lastID } = await runDb(
      this.db,
      `INSERT INTO sealed_products
         (user_id, name, game, product_type, set_name, quantity, purchase_price, current_value, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        input.name,
        input.game,
        input.productType,
        input.setName ?? null,
        input.quantity,
        input.purchasePrice,
        input.currentValue ?? null,
        input.notes ?? null,
      ]
    );
    const row = await this.getById(lastID, userId);
    if (!row) throw new Error('Failed to load created sealed product');
    return row;
  }

  async update(
    id: number,
    userId: number,
    updates: Partial<SealedProductInput>
  ): Promise<void> {
    const fieldMap: Record<string, string> = {
      name: 'name',
      game: 'game',
      productType: 'product_type',
      setName: 'set_name',
      quantity: 'quantity',
      purchasePrice: 'purchase_price',
      currentValue: 'current_value',
      notes: 'notes',
    };

    const fields: string[] = [];
    const values: unknown[] = [];

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = (updates as Record<string, unknown>)[key];
      if (value !== undefined) {
        fields.push(`${column} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);

    await runDb(
      this.db,
      `UPDATE sealed_products SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
  }

  async remove(id: number, userId: number): Promise<void> {
    await runDb(this.db, 'DELETE FROM sealed_products WHERE id = ? AND user_id = ?', [id, userId]);
  }

  async getById(id: number, userId: number): Promise<SealedProduct | undefined> {
    return getDbRow<SealedProduct>(
      this.db,
      'SELECT * FROM sealed_products WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  async stats(userId: number): Promise<SealedStats> {
    const items = await this.list(userId);

    let totalInvestment = 0;
    let totalValue = 0;
    const byType: Record<string, { count: number; value: number; investment: number }> = {};

    items.forEach((item) => {
      totalInvestment += (item.purchase_price || 0) * item.quantity;
      const value = (item.current_value ?? item.purchase_price) * item.quantity;
      totalValue += value;

      const bucket = byType[item.product_type] ?? { count: 0, value: 0, investment: 0 };
      bucket.count += item.quantity;
      bucket.value += value;
      bucket.investment += (item.purchase_price || 0) * item.quantity;
      byType[item.product_type] = bucket;
    });

    const profitLoss = totalValue - totalInvestment;
    const profitLossPercentage = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;

    return {
      itemCount: items.length,
      totalInvestment,
      totalValue,
      profitLoss,
      profitLossPercentage,
      byType,
    };
  }
}
