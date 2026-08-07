import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getDb } from '../db/database';
import { logger } from '../utils/logger';

const router = Router();

// Get all tracked cards for current user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const rows = await new Promise<any[]>((resolve, reject) => {
      db.all(
        'SELECT card_id, card_data, initial_price, added_at FROM user_tracked_cards WHERE user_id = ? ORDER BY added_at DESC',
        [req.user!.id],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });

    const trackedCards = rows.map((row) => ({
      id: row.card_id,
      card: JSON.parse(row.card_data),
      addedAt: row.added_at,
      initialPrice: row.initial_price,
      priceHistory: [{ date: row.added_at, price: row.initial_price }],
    }));

    res.json({ trackedCards });
  } catch (error: any) {
    logger.error('Error fetching tracked cards:', error);
    res.status(500).json({ error: error.message });
  }
});

// Track a card
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { cardId, cardData, initialPrice } = req.body;

    if (!cardId || !cardData) {
      return res.status(400).json({ error: 'cardId and cardData are required' });
    }

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_tracked_cards (user_id, card_id, card_data, initial_price)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, card_id) DO UPDATE SET
           card_data = excluded.card_data,
           initial_price = excluded.initial_price`,
        [req.user!.id, cardId, JSON.stringify(cardData), initialPrice || 0],
        (err) => (err ? reject(err) : resolve())
      );
    });

    res.status(201).json({ message: 'Card tracked successfully' });
  } catch (error: any) {
    logger.error('Error tracking card:', error);
    res.status(500).json({ error: error.message });
  }
});

// Untrack a card
router.delete('/:cardId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { cardId } = req.params;

    await new Promise<void>((resolve, reject) => {
      db.run(
        'DELETE FROM user_tracked_cards WHERE user_id = ? AND card_id = ?',
        [req.user!.id, cardId],
        (err) => (err ? reject(err) : resolve())
      );
    });

    res.json({ message: 'Card untracked successfully' });
  } catch (error: any) {
    logger.error('Error untracking card:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
