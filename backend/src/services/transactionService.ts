import { Database } from 'sqlite3';
import { allDbRows, getDbRow, runDb } from '../utils/dbAsync';

export type TransactionType = 'buy' | 'sell' | 'trade_in' | 'trade_out';

export interface Transaction {
  id: number;
  user_id: number;
  type: TransactionType;
  card_id?: string;
  card_name: string;
  game: 'pokemon' | 'onepiece';
  quantity: number;
  price_each: number;
  fees: number;
  transaction_date: string;
  notes?: string;
  created_at: string;
}

export interface TransactionInput {
  type: TransactionType;
  cardId?: string;
  cardName: string;
  game: 'pokemon' | 'onepiece';
  quantity: number;
  priceEach: number;
  fees?: number;
  transactionDate: string;
  notes?: string;
}

export interface LedgerSummary {
  totalInvested: number;
  totalRevenue: number;
  totalFees: number;
  realizedProfitLoss: number;
  realizedProfitLossPercentage: number;
  count: number;
  buyCount: number;
  sellCount: number;
}

export class TransactionService {
  constructor(private db: Database) {}

  async list(userId: number, limit = 500): Promise<Transaction[]> {
    return allDbRows<Transaction>(
      this.db,
      `SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC, id DESC LIMIT ?`,
      [userId, limit]
    );
  }

  async add(userId: number, input: TransactionInput): Promise<Transaction> {
    const { lastID } = await runDb(
      this.db,
      `INSERT INTO transactions
         (user_id, type, card_id, card_name, game, quantity, price_each, fees, transaction_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        input.type,
        input.cardId ?? null,
        input.cardName,
        input.game,
        input.quantity,
        input.priceEach,
        input.fees ?? 0,
        input.transactionDate,
        input.notes ?? null,
      ]
    );
    const row = await getDbRow<Transaction>(
      this.db,
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [lastID, userId]
    );
    if (!row) throw new Error('Failed to load created transaction');
    return row;
  }

  async remove(id: number, userId: number): Promise<void> {
    await runDb(this.db, 'DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, userId]);
  }

  async clear(userId: number): Promise<void> {
    await runDb(this.db, 'DELETE FROM transactions WHERE user_id = ?', [userId]);
  }

  async summary(userId: number): Promise<LedgerSummary> {
    const rows = await allDbRows<Transaction>(
      this.db,
      'SELECT * FROM transactions WHERE user_id = ?',
      [userId]
    );

    let totalInvested = 0;
    let totalRevenue = 0;
    let totalFees = 0;
    let buyCount = 0;
    let sellCount = 0;

    rows.forEach((t) => {
      const gross = t.price_each * t.quantity;
      totalFees += t.fees || 0;
      if (t.type === 'buy' || t.type === 'trade_out') {
        totalInvested += gross;
        buyCount += 1;
      } else {
        totalRevenue += gross - (t.fees || 0);
        sellCount += 1;
      }
    });

    const realizedProfitLoss = totalRevenue - totalInvested;
    const realizedProfitLossPercentage =
      totalInvested > 0 ? (realizedProfitLoss / totalInvested) * 100 : 0;

    return {
      totalInvested,
      totalRevenue,
      totalFees,
      realizedProfitLoss,
      realizedProfitLossPercentage,
      count: rows.length,
      buyCount,
      sellCount,
    };
  }

  async exportCsv(userId: number): Promise<string> {
    const rows = await this.list(userId, 100000);
    const header = 'date,type,card_name,game,quantity,price_each,fees,total,notes';
    const lines = rows.map((t) => {
      const total = (t.price_each * t.quantity) - (t.fees || 0);
      return [
        t.transaction_date,
        t.type,
        `"${(t.card_name || '').replace(/"/g, '""')}"`,
        t.game,
        t.quantity,
        t.price_each,
        t.fees || 0,
        total.toFixed(2),
        `"${(t.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });
    return [header, ...lines].join('\n');
  }
}
