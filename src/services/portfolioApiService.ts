import axios from 'axios';
import { buildApiUrl } from '../config/env';
import { VaultCard } from '../types/pokemon';
import { authService } from './authService';
import { VaultGame, normalizeGame } from './vaultStorage';

import '../config/apiClient';

interface PortfolioRow {
  id: number;
  card_id: string;
  card_name: string;
  card_data?: string | null;
  client_vault_id?: string | null;
  game?: string | null;
  client_updated_at?: string | null;
  quantity: number;
  purchase_price?: number;
  purchase_date?: string;
  condition?: string;
  notes?: string;
}

function rowToVaultCard(row: PortfolioRow): VaultCard | null {
  if (!row.card_data) return null;
  try {
    const parsed = JSON.parse(row.card_data) as VaultCard;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...parsed,
      // The row columns are authoritative for identity/versioning metadata.
      id: row.client_vault_id || parsed.id,
      game: normalizeGame(row.game ?? parsed.game),
      updatedAt: row.client_updated_at ?? parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function fetchRemoteVault(): Promise<VaultCard[]> {
  const response = await axios.get<{ success: boolean; data: { collection: PortfolioRow[] } }>(
    buildApiUrl('/api/portfolio')
  );
  const rows = response.data?.data?.collection ?? [];
  return rows.map(rowToVaultCard).filter((c): c is VaultCard => c !== null && Boolean(c.id));
}

/**
 * @param games Games this payload is authoritative for. The server only removes
 *   rows inside this scope, so a partial sync can never wipe another game.
 */
export async function pushVaultToRemote(cards: VaultCard[], games: VaultGame[]): Promise<number> {
  const response = await axios.post<{ success: boolean; data: { synced: number } }>(
    buildApiUrl('/api/portfolio/sync'),
    {
      cards: cards.map((card) => ({ ...card, game: normalizeGame(card.game) })),
      games,
    }
  );
  return response.data?.data?.synced ?? cards.length;
}

export function isAuthenticatedForSync(): boolean {
  return authService.getUser() !== null;
}
