import { fillPriceHistoryGaps } from '../../../utils/priceHistory';

export function buildSparklinePrices(history: { date: string; price: number }[]): number[] {
  if (history.length === 0) return [];
  const { points } = fillPriceHistoryGaps(history);
  return points.slice(-7).map((point) => point.price);
}
