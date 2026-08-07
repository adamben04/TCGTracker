import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database';
import { validate } from '../middleware/validation';
import { ok, fail } from '../utils/apiResponse';
import { allDbRows, getDbRow } from '../utils/dbAsync';
import { getGradedPrices } from '../services/gradedPriceService';

const router = Router();

// Estimated per-pack pull rates (cards per pack per rarity tier).
// Simplified approximation for SV-era booster packs; used for EV display only.
const PULL_RATES: Record<string, number> = {
  common: 8,
  uncommon: 3,
  rare: 0.55,
  holo: 0.38,
  ultra: 0.12,
  special: 0.04,
};

const normalizeRarity = (rarity?: string | null): string => {
  const r = (rarity || '').toLowerCase();
  if (
    r.includes('secret') ||
    r.includes('special') ||
    r.includes('illustration') ||
    r.includes('gold') ||
    r.includes('rainbow')
  )
    return 'special';
  if (
    r.includes('hyper') ||
    r.includes('full art') ||
    r.includes('ultra') ||
    r.includes('vmax') ||
    r.includes('vstar')
  )
    return 'ultra';
  if (r.includes('holo') || r.includes('radiant') || r.includes('shiny') || r.includes('v '))
    return 'holo';
  if (r.includes('rare')) return 'rare';
  if (r.includes('uncommon')) return 'uncommon';
  return 'common';
};

const querySchema = z.object({
  query: z.object({
    setId: z.string().min(1),
  }),
});

interface LatestPriceRow {
  uniqueIdentifier: string;
  marketPrice: number | null;
}

interface ChaseRow {
  uniqueIdentifier: string;
  cardId: string;
  cardName: string;
  rarity: string;
  rawPrice: number | null;
  psa10Price: number | null;
}

router.get('/rip-grade', validate(querySchema), async (req: Request, res: Response) => {
  try {
    const { setId } = req.query as { setId: string };
    const db = getDb();

    const setRow = await getDbRow<{ setId: string; setName: string }>(
      db,
      'SELECT setId, MIN(setName) as setName FROM card_mappings WHERE setId = ? OR setName LIKE ? GROUP BY setId LIMIT 1',
      [setId, `%${setId}%`]
    );

    if (!setRow) {
      return fail(res, 'Set not found', 404);
    }

    // Latest raw prices per card in the set
    const priceRows = await allDbRows<LatestPriceRow>(
      db,
      `SELECT ph.uniqueIdentifier, ph.marketPrice
         FROM price_history ph
         WHERE ph.date = (SELECT MAX(date) FROM price_history)
           AND ph.uniqueIdentifier IN (
             SELECT uniqueIdentifier FROM card_mappings WHERE setId = ? OR setName LIKE ?
           )`,
      [setId, `%${setId}%`]
    );
    const latestByCard = new Map(priceRows.map((r) => [r.uniqueIdentifier, r.marketPrice]));

    // Rarity aggregation over the set (prefer catalog rarity, fall back to mappings)
    const mappingRows = await allDbRows<{
      uniqueIdentifier: string;
      cardName: string;
      rarity: string | null;
    }>(
      db,
      `SELECT cm.uniqueIdentifier, cm.cardName, COALESCE(cc.rarity, cm.rarity) as rarity
         FROM card_mappings cm
         LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId AND cc.setId = cm.setId
         WHERE cm.setId = ? OR cm.setName LIKE ?`,
      [setId, `%${setId}%`]
    );

    const tierCounts = new Map<string, { count: number; total: number; priced: number }>();
    const cardTier = new Map<string, string>();
    const cardName = new Map<string, string>();

    mappingRows.forEach((row) => {
      const tier = normalizeRarity(row.rarity);
      cardTier.set(row.uniqueIdentifier, tier);
      cardName.set(row.uniqueIdentifier, row.cardName);
      const agg = tierCounts.get(tier) ?? { count: 0, total: 0, priced: 0 };
      agg.count += 1;
      const price = latestByCard.get(row.uniqueIdentifier);
      if (price != null) {
        agg.total += price;
        agg.priced += 1;
      }
      tierCounts.set(tier, agg);
    });

    const rarityStats = Array.from(tierCounts.entries())
      .map(([tier, agg]) => ({
        rarity: tier,
        count: agg.count,
        avgPrice: agg.priced > 0 ? agg.total / agg.priced : null,
      }))
      .sort((a, b) => (b.avgPrice ?? 0) - (a.avgPrice ?? 0));

    // EV per pack using pull-rate model
    const evBreakdown = rarityStats.map((s) => {
      const pullRate = PULL_RATES[s.rarity] ?? 0;
      const ev = pullRate * (s.avgPrice ?? 0);
      return { rarity: s.rarity, pullRate, avgPrice: s.avgPrice ?? 0, expectedValue: ev };
    });
    const evPerPack = evBreakdown.reduce((sum, b) => sum + b.expectedValue, 0);

    // Chase cards: raw vs PSA 10 graded price (largest uplift first)
    const chaseRows = await allDbRows<ChaseRow>(
      db,
      `SELECT
           cm.uniqueIdentifier,
           cm.cardId,
           cm.cardName,
           COALESCE(cc.rarity, cm.rarity) as rarity,
           ph.marketPrice as rawPrice,
           (SELECT AVG(gp.price) FROM graded_prices gp WHERE gp.cardId = cm.cardId AND gp.grader = 'psa' AND gp.grade IN ('10', 'Gem Mint 10')) as psa10Price
         FROM card_mappings cm
         LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId AND cc.setId = cm.setId
         JOIN price_history ph ON ph.uniqueIdentifier = cm.uniqueIdentifier
           AND ph.date = (SELECT MAX(date) FROM price_history)
         WHERE (cm.setId = ? OR cm.setName LIKE ?)
           AND ph.marketPrice IS NOT NULL
         ORDER BY ph.marketPrice DESC
         LIMIT 50`,
      [setId, `%${setId}%`]
    );

    const gradeOpportunities = chaseRows
      .map((row) => {
        const uplift = (row.psa10Price ?? 0) - (row.rawPrice ?? 0);
        return {
          uniqueIdentifier: row.uniqueIdentifier,
          cardName: row.cardName,
          rarity: row.rarity,
          rawPrice: row.rawPrice,
          psa10Price: row.psa10Price,
          uplift: row.rawPrice ? uplift : 0,
          upliftPercent: row.rawPrice && row.rawPrice > 0 ? (uplift / row.rawPrice) * 100 : 0,
        };
      })
      .filter((c) => c.psa10Price != null && c.rawPrice != null)
      .sort((a, b) => b.uplift - a.uplift)
      .slice(0, 10);

    // Background backfill: scrape graded prices for top chase cards lacking data
    // (rate-limited by gradedPriceService; caches into graded_prices table).
    void (async () => {
      const pending = chaseRows.filter((c) => c.psa10Price == null).slice(0, 10);
      if (pending.length === 0) return;
      try {
        for (const card of pending) {
          await getGradedPrices(card.cardId, card.cardName, String(setId), setRow.setName);
        }
      } catch (err) {
        // Background backfill is best-effort; never fails the response.
        console.error('Rip-grade backfill failed', err);
      }
    })();

    ok(res, {
      setId,
      setName: setRow.setName,
      totalCards: mappingRows.length,
      pricedCards: priceRows.length,
      rarityStats,
      evPerPack,
      evBreakdown,
      gradeOpportunities,
    });
  } catch (error: any) {
    fail(res, error.message);
  }
});

export default router;
