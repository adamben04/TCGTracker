import { OnePieceCard, OnePieceSet } from '../types/onepiece';

class OnePieceApiService {
  private baseUrl = 'https://optcgapi.com/api';
  private setsCache: OnePieceSet[] | null = null;
  private allCardsCache: OnePieceCard[] | null = null;

  async getAllSets(): Promise<OnePieceSet[]> {
    if (this.setsCache) return this.setsCache;
    
    const [setsResp, decksResp] = await Promise.all([
      fetch(`${this.baseUrl}/allSets/?format=json`),
      fetch(`${this.baseUrl}/allDecks/?format=json`),
    ]);
    
    const setsData = await setsResp.json();
    const decksData = await decksResp.json();
    
    const sets: OnePieceSet[] = [
      ...setsData.map((s: any) => ({ id: s.set_id, name: s.set_name, type: 'set' as const })),
      ...decksData.map((d: any) => ({ id: d.structure_deck_id ?? d.st_id, name: d.structure_deck_name ?? d.st_name, type: 'starter' as const })),
    ];
    
    this.setsCache = sets;
    return sets;
  }

  async getAllCards(): Promise<OnePieceCard[]> {
    if (this.allCardsCache) return this.allCardsCache;
    
    const [setsResp, decksResp, promoResp] = await Promise.all([
      fetch(`${this.baseUrl}/allSetCards/?format=json`),
      fetch(`${this.baseUrl}/allSTCards/?format=json`),
      fetch(`${this.baseUrl}/allPromoCards/?format=json`).catch(() => ({ json: () => [] })),
    ]);
    
    const setsCards = await setsResp.json();
    const decksCards = await decksResp.json();
    const promosCards = await promoResp.json();
    
    const allRaw = [...setsCards, ...decksCards, ...promosCards];
    const cards = allRaw.map((c: any) => this.mapCard(c)).filter(Boolean);
    
    this.allCardsCache = cards;
    return cards;
  }

  async searchCards(query: string): Promise<OnePieceCard[]> {
    const all = await this.getAllCards();
    const q = query.toLowerCase();
    return all.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }

  async getSetCards(setId: string): Promise<OnePieceCard[]> {
    const all = await this.getAllCards();
    return all.filter(c => c.setId === setId);
  }

  async getCardById(cardId: string): Promise<OnePieceCard | null> {
    const all = await this.getAllCards();
    return all.find(c => c.id === cardId) || null;
  }

  async getCardsWithPriceHistory(): Promise<OnePieceCard[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/sets/card/twoweeks/?format=json`);
      const data = await resp.json();
      return (data || []).map((c: any) => this.mapCard(c)).filter(Boolean);
    } catch {
      return this.getAllCards();
    }
  }

  extractCardPrice(card: OnePieceCard): number {
    return card.marketPrice || card.inventoryPrice || 0;
  }

  private mapCard(raw: any): OnePieceCard | null {
    if (!raw || !raw.card_set_id) return null;
    
    const setId = raw.set_id || raw.structure_deck_id || raw.st_id || '';
    const setName = raw.set_name || raw.structure_deck_name || raw.st_name || 'Unknown';
    
    return {
      id: raw.card_set_id,
      name: raw.card_name || 'Unknown',
      setId,
      setName,
      number: raw.card_set_id,
      rarity: raw.rarity || 'C',
      color: raw.card_color || 'Unknown',
      cardType: raw.card_type || 'Character',
      cost: raw.card_cost ? parseInt(raw.card_cost) : null,
      power: raw.card_power ? parseInt(raw.card_power) : null,
      counter: raw.counter_amount || null,
      life: raw.life ? parseInt(raw.life) : null,
      attribute: raw.attribute || null,
      subTypes: raw.sub_types || '',
      cardText: raw.card_text || '',
      imageUrl: raw.card_image || '',
      marketPrice: raw.market_price || 0,
      inventoryPrice: raw.inventory_price || 0,
      images: raw.card_image ? { small: raw.card_image, large: raw.card_image } : undefined,
      tcgplayer: undefined,
      cardmarket: undefined,
      investmentData: undefined,
      set: {
        id: setId,
        name: setName,
        releaseDate: '',
        total: 0,
        series: 'One Piece',
      },
    };
  }
}

export const onepieceApi = new OnePieceApiService();
