import { VaultCard } from '../types/pokemon';
import { authService } from './authService';

export type VaultGame = 'pokemon' | 'onepiece';

export const VAULT_GAMES: VaultGame[] = ['pokemon', 'onepiece'];

export const VAULT_UPDATED_EVENT = 'tcg:vault-updated';

const BASE_KEYS: Record<VaultGame, string> = {
  pokemon: 'tcg_vault_cards_pokemon',
  onepiece: 'tcg_vault_cards_onepiece',
};

/** Pre-per-game storage key. Migrated once into the anonymous Pokemon vault. */
const LEGACY_KEY = 'tcg_vault_cards';
const LEGACY_MIGRATION_FLAG = 'tcg_vault_legacy_migrated';
const TOMBSTONE_BASE_KEY = 'tcg_vault_tombstones';

/**
 * Records which account (if any) already absorbed the shared anonymous vault.
 * Without this, signing in as a second account on the same browser would upload
 * the first user's local cards into the new account.
 */
const ANONYMOUS_CLAIM_KEY = 'tcg_vault_anonymous_claimed_by';

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface VaultScope {
  userId: number | null;
}

export const ANONYMOUS_SCOPE: VaultScope = { userId: null };

export type VaultTombstones = Record<string, string>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function scopeSuffix(scope: VaultScope): string {
  return scope.userId === null || scope.userId === undefined ? '' : `::user_${scope.userId}`;
}

export function normalizeGame(game?: string | null): VaultGame {
  return game === 'onepiece' ? 'onepiece' : 'pokemon';
}

export function vaultStorageKey(game: VaultGame, scope: VaultScope = ANONYMOUS_SCOPE): string {
  return `${BASE_KEYS[game]}${scopeSuffix(scope)}`;
}

export function tombstoneStorageKey(scope: VaultScope = ANONYMOUS_SCOPE): string {
  return `${TOMBSTONE_BASE_KEY}${scopeSuffix(scope)}`;
}

/** The scope the UI reads/writes right now: the signed-in user, or anonymous. */
let lastKnownScopeKey: string | null = null;

export function getActiveScope(): VaultScope {
  const user = authService.getUser();
  const scope: VaultScope = { userId: user ? user.id : null };
  const key = scopeSuffix(scope);

  if (lastKnownScopeKey === null) {
    lastKnownScopeKey = key;
  } else if (lastKnownScopeKey !== key) {
    // Signing in or out swaps the underlying storage namespace, so views that
    // cache vault cards need to reload. Deferred to avoid re-entrant dispatch.
    lastKnownScopeKey = key;
    const notify = () => notifyVaultUpdated();
    if (typeof queueMicrotask === 'function') queueMicrotask(notify);
    else setTimeout(notify, 0);
  }

  return scope;
}

function readJson<T>(key: string, fallback: T): T {
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error writing vault storage:', error);
  }
}

export function notifyVaultUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VAULT_UPDATED_EVENT));
}

/**
 * One-time migration of the pre-per-game `tcg_vault_cards` key into the
 * anonymous Pokemon vault. Never overwrites data that already exists.
 */
export function migrateLegacyVaultKeys(): void {
  const store = storage();
  if (!store) return;
  if (store.getItem(LEGACY_MIGRATION_FLAG) === '1') return;

  const legacy = readJson<VaultCard[]>(LEGACY_KEY, []);
  if (Array.isArray(legacy) && legacy.length > 0) {
    const target = vaultStorageKey('pokemon', ANONYMOUS_SCOPE);
    const existing = readJson<VaultCard[]>(target, []);
    const tagged = legacy.map((card) => ({ ...card, game: normalizeGame(card.game) }));
    const merged = mergeVaultCards(existing, tagged);
    writeVault('pokemon', merged, ANONYMOUS_SCOPE);
  }

  if (store.getItem(LEGACY_KEY) !== null) store.removeItem(LEGACY_KEY);
  store.setItem(LEGACY_MIGRATION_FLAG, '1');
}

export function readVault(game: VaultGame, scope: VaultScope = ANONYMOUS_SCOPE): VaultCard[] {
  const cards = readJson<VaultCard[]>(vaultStorageKey(game, scope), []);
  if (!Array.isArray(cards)) return [];
  return cards.map((card) => ({ ...card, game: normalizeGame(card.game) }));
}

export function writeVault(
  game: VaultGame,
  cards: VaultCard[],
  scope: VaultScope = ANONYMOUS_SCOPE
): void {
  writeJson(
    vaultStorageKey(game, scope),
    cards.map((card) => ({ ...card, game }))
  );
}

export function readAllVaults(scope: VaultScope = ANONYMOUS_SCOPE): VaultCard[] {
  return VAULT_GAMES.flatMap((game) => readVault(game, scope));
}

/** Writes a combined snapshot, splitting it back into the per-game buckets. */
export function writeAllVaults(cards: VaultCard[], scope: VaultScope = ANONYMOUS_SCOPE): void {
  for (const game of VAULT_GAMES) {
    writeVault(
      game,
      cards.filter((card) => normalizeGame(card.game) === game),
      scope
    );
  }
}

export function readTombstones(scope: VaultScope = ANONYMOUS_SCOPE): VaultTombstones {
  const value = readJson<VaultTombstones>(tombstoneStorageKey(scope), {});
  return value && typeof value === 'object' ? value : {};
}

export function writeTombstones(
  tombstones: VaultTombstones,
  scope: VaultScope = ANONYMOUS_SCOPE
): void {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const pruned: VaultTombstones = {};
  for (const [id, deletedAt] of Object.entries(tombstones)) {
    const time = Date.parse(deletedAt);
    if (Number.isNaN(time) || time >= cutoff) pruned[id] = deletedAt;
  }
  writeJson(tombstoneStorageKey(scope), pruned);
}

export function recordTombstones(ids: string[], scope: VaultScope = ANONYMOUS_SCOPE): void {
  if (ids.length === 0) return;
  const tombstones = readTombstones(scope);
  const now = new Date().toISOString();
  for (const id of ids) tombstones[id] = now;
  writeTombstones(tombstones, scope);
}

export function clearTombstones(ids: string[], scope: VaultScope = ANONYMOUS_SCOPE): void {
  if (ids.length === 0) return;
  const tombstones = readTombstones(scope);
  let changed = false;
  for (const id of ids) {
    if (id in tombstones) {
      delete tombstones[id];
      changed = true;
    }
  }
  if (changed) writeTombstones(tombstones, scope);
}

function versionOf(card: VaultCard): number {
  const candidates = [card.updatedAt, card.purchaseDate];
  for (const value of candidates) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}

/**
 * Non-destructive merge keyed on the stable client vault id. The newest version
 * of each record wins; entries only present on one side are always kept, so a
 * remote snapshot can never silently discard local work (and vice versa).
 * Records with a newer local tombstone stay deleted.
 */
export function mergeVaultCards(
  primary: VaultCard[],
  secondary: VaultCard[],
  tombstones: VaultTombstones = {}
): VaultCard[] {
  const merged = new Map<string, VaultCard>();

  const consider = (card: VaultCard) => {
    if (!card || !card.id) return;
    const deletedAt = tombstones[card.id];
    if (deletedAt) {
      const deletedTime = Date.parse(deletedAt);
      if (!Number.isNaN(deletedTime) && deletedTime >= versionOf(card)) return;
    }
    const normalized = { ...card, game: normalizeGame(card.game) };
    const existing = merged.get(card.id);
    if (!existing || versionOf(normalized) > versionOf(existing)) {
      merged.set(card.id, normalized);
    }
  };

  primary.forEach(consider);
  secondary.forEach(consider);

  return Array.from(merged.values());
}

/** Stable fingerprint used to decide whether a push is actually needed. */
export function vaultFingerprint(cards: VaultCard[]): string {
  return cards
    .map(
      (card) => `${card.id}:${normalizeGame(card.game)}:${card.updatedAt ?? ''}:${card.quantity}`
    )
    .sort()
    .join('|');
}

/**
 * Moves the shared anonymous vault into an account namespace the first time that
 * account signs in on this browser. Later accounts are refused, which is what
 * stops one user's local cards from being uploaded to somebody else's account.
 * The anonymous copy is left in place so signed-out, local-first use keeps working.
 */
export function claimAnonymousVaultFor(userId: number): boolean {
  const store = storage();
  if (!store) return false;

  const claimedBy = store.getItem(ANONYMOUS_CLAIM_KEY);
  if (claimedBy !== null) return false;

  const anonymous = readAllVaults(ANONYMOUS_SCOPE);
  const scope: VaultScope = { userId };

  store.setItem(ANONYMOUS_CLAIM_KEY, String(userId));

  if (anonymous.length === 0) return false;

  const existing = readAllVaults(scope);
  const merged = mergeVaultCards(existing, anonymous, readTombstones(scope));
  if (vaultFingerprint(merged) === vaultFingerprint(existing)) return false;

  writeAllVaults(merged, scope);
  return true;
}

/** Test helper: wipes every vault-related key for a clean slate. */
export function resetVaultStorageForTests(): void {
  lastKnownScopeKey = null;
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key && (key.startsWith('tcg_vault') || key === LEGACY_KEY)) keys.push(key);
  }
  keys.forEach((key) => store.removeItem(key));
}
