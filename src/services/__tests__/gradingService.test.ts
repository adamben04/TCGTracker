import { describe, expect, it } from 'vitest';
import { GradingResult } from '../../types/grading';
import { sanitizeGradingResultForHistory } from '../gradingService';

describe('grading history persistence', () => {
  it('keeps measurements but removes embedded image evidence', () => {
    const category = {
      score: 8,
      details: 'Visible wear',
      defects: ['edge wear'],
      crops: [{ label: 'edge', image: 'data:image/jpeg;base64,crop' }],
    };
    const result = {
      id: 'grade-1',
      cardId: 'base1-4',
      cardName: 'Charizard',
      game: 'pokemon',
      centering: {
        ...category,
        deviations: { leftRight: 2, topBottom: 1 },
      },
      corners: category,
      edges: category,
      surface: category,
      totalScore: 800,
      grade: 8,
      gradeLabel: 'NM-MT',
      imageUrl: 'data:image/jpeg;base64,front',
      backImageUrl: 'data:image/jpeg;base64,back',
      timestamp: '2026-01-01T00:00:00.000Z',
      front: {
        centering: { ...category, deviations: { leftRight: 2, topBottom: 1 } },
        corners: category,
        edges: category,
        surface: category,
      },
      extraction: {
        found: true,
        confidence: 0.9,
        overlay: 'data:image/jpeg;base64,overlay',
      },
      defectRegions: [
        {
          category: 'edges',
          label: 'edge wear',
          severity: 'minor',
          cropImage: 'data:image/jpeg;base64,defect',
        },
      ],
    } satisfies GradingResult;

    const sanitized = sanitizeGradingResultForHistory(result);
    expect(sanitized.imageUrl).toBe('');
    expect(sanitized.backImageUrl).toBeUndefined();
    expect(sanitized.edges.crops).toBeUndefined();
    expect(sanitized.front?.corners.crops).toBeUndefined();
    expect(sanitized.extraction?.overlay).toBeUndefined();
    expect(sanitized.extraction?.confidence).toBe(0.9);
    expect(sanitized.defectRegions?.[0].cropImage).toBeUndefined();
  });
});
