/**
 * SQL helpers and row mappers for the grading_results table.
 * Table is created by migration 19, extended in migration 20 (defect_regions) and 21 (fullResult).
 */

export const GRADING_RESULTS_TABLE = 'grading_results';

export interface GradingResultRow {
  id: string;
  user_id: string;
  card_id: string | null;
  card_name: string;
  game: string;
  centering_score: number;
  corners_score: number;
  edges_score: number;
  surface_score: number;
  total_score: number;
  grade: number;
  grade_label: string;
  defects: string; // JSON
  image_url: string | null;
  estimated_value: number | null;
  created_at: string;
  centering_details?: string | null;
  corners_details?: string | null;
  edges_details?: string | null;
  surface_details?: string | null;
  deviations?: string | null; // JSON
  suggested_condition?: string | null;
  defect_regions?: string | null; // JSON array of DefectRegion
  full_result?: string | null; // JSON — complete grading result from Python backend
  back_image_url?: string | null;
}

export interface GradingResultDTO {
  id: string;
  cardId: string;
  cardName: string;
  game: 'pokemon' | 'onepiece';
  centering: {
    score: number;
    details: string;
    deviations: { leftRight: number; topBottom: number };
    defects: string[];
    crops?: Array<{
      label: string;
      image: string;
      location?: { x: number; y: number; width: number; height: number };
    }>;
  };
  corners: {
    score: number;
    details: string;
    defects: string[];
    crops?: Array<{
      label: string;
      image: string;
      location?: { x: number; y: number; width: number; height: number };
    }>;
    deviations?: Record<string, unknown>;
  };
  edges: {
    score: number;
    details: string;
    defects: string[];
    crops?: Array<{
      label: string;
      image: string;
      location?: { x: number; y: number; width: number; height: number };
    }>;
    deviations?: Record<string, unknown>;
  };
  surface: {
    score: number;
    details: string;
    defects: string[];
    crops?: Array<{
      label: string;
      image: string;
      location?: { x: number; y: number; width: number; height: number };
    }>;
  };
  totalScore: number;
  grade: number;
  gradeLabel: string;
  imageUrl: string;
  backImageUrl?: string;
  timestamp: string;
  estimatedGradedValue?: number;
  suggestedCondition?: string;
  defectRegions?: Array<{
    category: string;
    side?: string;
    label: string;
    severity: string;
    /** Omitted when persisting to keep SQLite payload small; crops live in front/back. */
    cropImage?: string;
    location?: { x: number; y: number; width: number; height: number };
  }>;
  /** Full structured result from Python backend (front/back data) */
  front?: Record<string, unknown>;
  back?: Record<string, unknown>;
  confidence?: number;
  retakeRecommended?: boolean;
  limitations?: string;
  quality?: Record<string, unknown>;
  extraction?: Record<string, unknown>;
  provider?: Record<string, unknown>;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToGradingResult(row: GradingResultRow): GradingResultDTO {
  const defects = parseJson<{
    centering?: string[];
    corners?: string[];
    edges?: string[];
    surface?: string[];
  }>(row.defects, {});

  const deviations = parseJson<Record<string, unknown>>(row.deviations, {
    leftRight: 0,
    topBottom: 0,
  });

  const defectRegions = parseJson<GradingResultDTO['defectRegions']>(row.defect_regions, undefined);

  const fullResult = parseJson<Record<string, unknown> | null>(row.full_result, null);

  // If fullResult has front/back structure, use it
  const front = fullResult?.front as Record<string, unknown> | undefined;
  const back = fullResult?.back as Record<string, unknown> | undefined;

  return {
    id: row.id,
    cardId: row.card_id || '',
    cardName: row.card_name,
    game: (row.game === 'onepiece' ? 'onepiece' : 'pokemon') as 'pokemon' | 'onepiece',
    centering: {
      score: row.centering_score,
      details: row.centering_details || '',
      deviations: (deviations as { leftRight: number; topBottom: number }) || {
        leftRight: 0,
        topBottom: 0,
      },
      defects: defects.centering || [],
    },
    corners: {
      score: row.corners_score,
      details: row.corners_details || '',
      defects: defects.corners || [],
    },
    edges: {
      score: row.edges_score,
      details: row.edges_details || '',
      defects: defects.edges || [],
    },
    surface: {
      score: row.surface_score,
      details: row.surface_details || '',
      defects: defects.surface || [],
    },
    totalScore: row.total_score,
    grade: row.grade,
    gradeLabel: row.grade_label,
    imageUrl: row.image_url || '',
    backImageUrl: row.back_image_url || undefined,
    timestamp: row.created_at,
    estimatedGradedValue: row.estimated_value ?? undefined,
    suggestedCondition: row.suggested_condition ?? undefined,
    defectRegions,
    front: front ?? undefined,
    back: back ?? undefined,
    confidence: fullResult?.confidence as number | undefined,
    retakeRecommended: fullResult?.retakeRecommended as boolean | undefined,
    limitations: fullResult?.limitations as string | undefined,
    quality: fullResult?.quality as Record<string, unknown> | undefined,
    extraction: fullResult?.extraction as Record<string, unknown> | undefined,
    provider: fullResult?.provider as Record<string, unknown> | undefined,
  };
}

export const CREATE_GRADING_RESULTS_SQL = `
CREATE TABLE IF NOT EXISTS grading_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id TEXT,
  card_name TEXT NOT NULL,
  game TEXT NOT NULL DEFAULT 'pokemon',
  centering_score REAL NOT NULL,
  corners_score REAL NOT NULL,
  edges_score REAL NOT NULL,
  surface_score REAL NOT NULL,
  total_score REAL NOT NULL,
  grade REAL NOT NULL,
  grade_label TEXT NOT NULL,
  defects TEXT,
  image_url TEXT,
  estimated_value REAL,
  centering_details TEXT,
  corners_details TEXT,
  edges_details TEXT,
  surface_details TEXT,
  deviations TEXT,
  suggested_condition TEXT,
  defect_regions TEXT,
  full_result TEXT,
  back_image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`;
