import { logger } from '../../utils/logger';

const TCGDEX_BASE_URL = 'https://api.tcgdex.net/v2/en';
const CACHE_TTL_MS = 30 * 60 * 1000;
const DETAIL_TIMEOUT_MS = 5_000;
const SAMPLE_SIZE = 96;
const BATCH_SIZE = 24;

interface TcgDexCardSummary {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface TcgDexCardDetail extends TcgDexCardSummary {
  rarity?: string;
  set?: { id?: string; name?: string };
  pricing?: unknown;
  variants_detailed?: Array<{ pricing?: unknown }>;
}

export interface TcgDexPackCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  images: { small: string; large: string };
  set: { id: string; name: string; releaseDate: string; total: number };
  marketPrice: number;
  tcgplayer: { prices: { normal: { market: number } } };
  source: 'tcgdex_pack_fallback';
}

const PRIORITY_CARD_IDS = [
  'base1-1',
  'base1-2',
  'base1-4',
  'base1-15',
  'base2-1',
  'base3-1',
  'base4-1',
  'neo1-9',
  'swsh4-25',
  'swsh12pt5-160',
  'sv03.5-199',
  'sv08.5-161',
];

let cachedPool: { fetchedAt: number; cards: TcgDexPackCard[] } | null = null;
let pendingPool: Promise<TcgDexPackCard[]> | null = null;

async function fetchJson<T>(url: string, timeoutMs = DETAIL_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'TCGTracker/1.0' },
    });
    if (!response.ok) throw new Error(`TCGdex ${response.status}: ${response.statusText}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function collectPriceValues(value: unknown, keyName: string, result: number[]): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === keyName && typeof child === 'number' && child > 0 && child < 100_000) {
      result.push(child);
    } else if (child && typeof child === 'object') {
      collectPriceValues(child, keyName, result);
    }
  }
}

function resolveMarketPrice(card: TcgDexCardDetail): number {
  const pricingSources = [card.pricing, ...(card.variants_detailed ?? []).map((v) => v.pricing)];
  for (const key of ['marketPrice', 'midPrice', 'avg', 'trend']) {
    const values: number[] = [];
    for (const pricing of pricingSources) collectPriceValues(pricing, key, values);
    if (values.length > 0) return Math.max(...values);
  }
  return 0;
}

function selectSummaries(allCards: TcgDexCardSummary[]): TcgDexCardSummary[] {
  const byId = new Map(allCards.filter((card) => card.image).map((card) => [card.id, card]));
  const selected = new Map<string, TcgDexCardSummary>();
  for (const id of PRIORITY_CARD_IDS) {
    const card = byId.get(id);
    if (card) selected.set(id, card);
  }

  const candidates = Array.from(byId.values());
  const stride = Math.max(1, Math.floor(candidates.length / SAMPLE_SIZE));
  for (let index = 0; index < candidates.length && selected.size < SAMPLE_SIZE; index += stride) {
    const card = candidates[index];
    selected.set(card.id, card);
  }
  return Array.from(selected.values());
}

function mapDetail(card: TcgDexCardDetail): TcgDexPackCard | null {
  const marketPrice = resolveMarketPrice(card);
  if (!card.image || marketPrice <= 0) return null;
  return {
    id: card.id,
    name: card.name,
    number: card.localId,
    rarity: card.rarity,
    images: {
      small: `${card.image}/low.webp`,
      large: `${card.image}/high.webp`,
    },
    set: {
      id: card.set?.id || card.id.split('-')[0],
      name: card.set?.name || 'Pokemon TCG',
      releaseDate: '2020-01-01',
      total: 0,
    },
    marketPrice,
    tcgplayer: { prices: { normal: { market: marketPrice } } },
    source: 'tcgdex_pack_fallback',
  };
}

async function buildPool(): Promise<TcgDexPackCard[]> {
  const summaries = await fetchJson<TcgDexCardSummary[]>(`${TCGDEX_BASE_URL}/cards`, 10_000);
  const selected = selectSummaries(summaries);
  const cards: TcgDexPackCard[] = [];

  for (let start = 0; start < selected.length; start += BATCH_SIZE) {
    const batch = selected.slice(start, start + BATCH_SIZE);
    const details = await Promise.allSettled(
      batch.map((card) =>
        fetchJson<TcgDexCardDetail>(`${TCGDEX_BASE_URL}/cards/${encodeURIComponent(card.id)}`)
      )
    );
    for (const detail of details) {
      if (detail.status !== 'fulfilled') continue;
      const card = mapDetail(detail.value);
      if (card) cards.push(card);
    }
  }

  if (cards.length === 0) throw new Error('TCGdex returned no priced cards');
  logger.info('Built live TCGdex pack fallback', {
    sampled: selected.length,
    priced: cards.length,
  });
  return cards;
}

export async function getTcgDexPackPool(limit = SAMPLE_SIZE): Promise<TcgDexPackCard[]> {
  if (cachedPool && Date.now() - cachedPool.fetchedAt < CACHE_TTL_MS) {
    return cachedPool.cards.slice(0, limit);
  }
  if (!pendingPool) {
    pendingPool = buildPool();
  }
  const pending = pendingPool;
  try {
    const cards = await pending;
    cachedPool = { fetchedAt: Date.now(), cards };
    return cards.slice(0, limit);
  } finally {
    if (pendingPool === pending) pendingPool = null;
  }
}

export function clearTcgDexPackPoolCache(): void {
  cachedPool = null;
  pendingPool = null;
}
