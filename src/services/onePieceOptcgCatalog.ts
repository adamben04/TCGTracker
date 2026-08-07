import { OnePieceCard } from '../types/onepiece';
import { cardMatchesOnePieceQuery } from '../utils/onePieceSearch';

interface OPTCGCardResponse {
  inventory_price: number;
  market_price: number;
  card_name: string;
  set_name: string;
  card_text: string;
  set_id: string;
  rarity: string;
  card_set_id: string;
  card_color: string;
  card_type: string;
  life: string | null;
  card_cost: string | null;
  card_power: string | null;
  sub_types: string | null;
  counter_amount: number | null;
  attribute: string | null;
  date_scraped: string;
  card_image_id: string;
  card_image: string;
}

interface OPTCGDonResponse {
  inventory_price: number;
  market_price: number;
  card_name: string;
  card_text: string;
  rarity: string;
  card_type: string;
  card_image_id: string;
  card_image: string;
  date_scraped: string;
  optcg_don_name?: string;
}

function buildCatalogId(
  raw: Pick<OPTCGCardResponse, 'set_id' | 'card_image_id' | 'card_name'>
): string {
  return `${raw.set_id}::${raw.card_image_id}::${raw.card_name}`;
}

function normalizeDon(raw: OPTCGDonResponse): OPTCGCardResponse {
  return {
    inventory_price: raw.inventory_price,
    market_price: raw.market_price,
    card_name: raw.card_name,
    set_name: 'Don!! Cards',
    card_text: raw.card_text || '',
    set_id: 'DON',
    rarity: raw.rarity || 'DON!!',
    card_set_id: raw.card_image_id || raw.optcg_don_name || raw.card_name,
    card_color: '',
    card_type: raw.card_type || 'DON!!',
    life: null,
    card_cost: null,
    card_power: null,
    sub_types: null,
    counter_amount: null,
    attribute: null,
    date_scraped: raw.date_scraped,
    card_image_id: raw.card_image_id,
    card_image: raw.card_image,
  };
}

function mapRaw(raw: OPTCGCardResponse): OnePieceCard {
  return {
    id: buildCatalogId(raw),
    name: raw.card_name,
    images: { small: raw.card_image, large: raw.card_image },
    set: { id: raw.set_id, name: raw.set_name },
    number: raw.card_set_id,
    rarity: raw.rarity || undefined,
    cardColor: raw.card_color || undefined,
    cardType: raw.card_type || undefined,
    cardCost: raw.card_cost || undefined,
    cardPower: raw.card_power || undefined,
    counterAmount: raw.counter_amount ?? undefined,
    life: raw.life || undefined,
    subTypes: raw.sub_types || undefined,
    attribute: raw.attribute || undefined,
    cardText: raw.card_text || undefined,
    marketPrice: raw.market_price ?? undefined,
    inventoryPrice: raw.inventory_price ?? undefined,
  };
}

const CACHE_TTL = 60 * 60 * 1000;
const PARTIAL_CACHE_TTL = 90 * 1000;
let cachedCatalog: { fetchedAt: number; cards: OnePieceCard[]; complete: boolean } | null = null;

export async function fetchFullOptcgCatalog(
  fetchJson: <T>(path: string) => Promise<T>
): Promise<OnePieceCard[]> {
  if (
    cachedCatalog &&
    Date.now() - cachedCatalog.fetchedAt < (cachedCatalog.complete ? CACHE_TTL : PARTIAL_CACHE_TTL)
  ) {
    return cachedCatalog.cards;
  }

  const [setResult, starterResult, promoResult, donResult] = await Promise.allSettled([
    fetchJson<OPTCGCardResponse[]>('/allSetCards/'),
    fetchJson<OPTCGCardResponse[]>('/allSTCards/'),
    fetchJson<OPTCGCardResponse[]>('/promos/filtered/?card_name='),
    fetchJson<OPTCGDonResponse[]>('/allDonCards/'),
  ]);
  const setCards = setResult.status === 'fulfilled' ? setResult.value : [];
  const stCards = starterResult.status === 'fulfilled' ? starterResult.value : [];
  const promoCards = promoResult.status === 'fulfilled' ? promoResult.value : [];
  const donCards = donResult.status === 'fulfilled' ? donResult.value : [];
  const complete = [setResult, starterResult, promoResult, donResult].every(
    (result) => result.status === 'fulfilled'
  );

  const seen = new Map<string, OnePieceCard>();
  if (!complete) {
    for (const card of cachedCatalog?.cards ?? []) {
      seen.set(card.id, card);
    }
  }
  for (const raw of [...setCards, ...stCards, ...promoCards, ...donCards.map(normalizeDon)]) {
    seen.set(buildCatalogId(raw), mapRaw(raw));
  }

  const cards = Array.from(seen.values());
  if (cards.length === 0) {
    throw new Error('All OPTCG catalog sources failed.');
  }
  cachedCatalog = { fetchedAt: Date.now(), cards, complete };
  return cards;
}

export function clearOptcgCatalogCache(): void {
  cachedCatalog = null;
}

export function searchOptcgCatalog(
  cards: OnePieceCard[],
  query: string,
  setId?: string
): OnePieceCard[] {
  let results = cards.filter((c) => cardMatchesOnePieceQuery(c, query));
  if (setId) {
    results = results.filter(
      (c) => c.set.id === setId || c.set.name.toLowerCase().includes(setId.toLowerCase())
    );
  }
  return results;
}
