export interface OnePieceSet {
  id: string;          // e.g. "OP-01"
  name: string;        // e.g. "Romance Dawn"
  type: 'set' | 'starter' | 'promo';
}

export interface OnePieceCard {
  id: string;              // card_set_id e.g. "OP01-001"
  name: string;            // card_name
  setId: string;           // set_id e.g. "OP-01"
  setName: string;         // set_name e.g. "Romance Dawn"
  number: string;          // same as id
  rarity: string;          // L, C, UC, R, SR, SEC
  color: string;           // Red, Blue, Green, Purple, Black, Yellow
  cardType: string;        // Leader, Character, Event, Stage, DON!!
  cost: number | null;     // DON!! cost
  power: number | null;    // battle power
  counter: number | null;  // counter power
  life: number | null;     // life (leaders only)
  attribute: string | null; // Slash, Strike, Ranged, Special, Wisdom
  subTypes: string;        // e.g. "Straw Hat Crew"
  cardText: string;        // effect text
  imageUrl: string;
  marketPrice: number;
  inventoryPrice: number;
  images?: { small: string; large: string };
  // Union compatibility fields (set to undefined/empty so PokemonCard code paths don't crash)
  tcgplayer?: undefined;
  cardmarket?: undefined;
  investmentData?: undefined;
  set: { id: string; name: string; releaseDate: string; total: number; series: string; images?: { symbol?: string; logo?: string } };
}

export interface OnePiecePack {
  id: string;
  name: string;
  tier: 'common' | 'uncommon' | 'rare' | 'ultra-rare' | 'secret-rare';
  price: number;
  averageValue: number;
  cardsPerPack: number;
  imageUrl: string;
  description: string;
  valueRanges: { min: number; max: number; probability: number }[];
  tcg: 'onepiece';
}
