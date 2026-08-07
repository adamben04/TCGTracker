import { describe, expect, it } from 'vitest';
import { cardMatchesOnePieceQuery, isOnePieceSetId } from '../onePieceSearch';

describe('One Piece catalog helpers', () => {
  it('recognizes booster, starter, extra, and premium set identifiers', () => {
    expect(isOnePieceSetId('OP-01')).toBe(true);
    expect(isOnePieceSetId('ST12')).toBe(true);
    expect(isOnePieceSetId('EB-02')).toBe(true);
    expect(isOnePieceSetId('PRB01')).toBe(true);
    expect(isOnePieceSetId('PROMO')).toBe(true);
    expect(isOnePieceSetId('DON')).toBe(true);
    expect(isOnePieceSetId('sv4')).toBe(false);
  });

  it('matches names, card numbers, and set metadata', () => {
    const card = {
      name: 'Monkey.D.Luffy',
      number: 'OP01-003',
      set: { id: 'OP-01', name: 'Romance Dawn' },
      cardType: 'Leader',
      subTypes: 'Straw Hat Crew',
    };

    expect(cardMatchesOnePieceQuery(card, 'luffy')).toBe(true);
    expect(cardMatchesOnePieceQuery(card, 'OP01-003')).toBe(true);
    expect(cardMatchesOnePieceQuery(card, 'romance dawn')).toBe(true);
    expect(cardMatchesOnePieceQuery(card, 'charizard')).toBe(false);
  });
});
