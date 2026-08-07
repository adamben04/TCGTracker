import { VaultCard } from '../types/pokemon';
import { authService } from './authService';
import { fetchRemoteVault, pushVaultToRemote } from './portfolioApiService';
import {
  VAULT_GAMES,
  VaultScope,
  claimAnonymousVaultFor,
  getActiveScope,
  mergeVaultCards,
  migrateLegacyVaultKeys,
  notifyVaultUpdated,
  readAllVaults,
  readTombstones,
  vaultFingerprint,
  writeAllVaults,
} from './vaultStorage';

export const VAULT_SYNC_STATUS_EVENT = 'tcg:vault-sync-status';

export type VaultSyncStatus = 'local' | 'idle' | 'syncing' | 'synced' | 'error';

export interface VaultSyncState {
  status: VaultSyncStatus;
  message?: string;
}

let syncState: VaultSyncState & { userId: number | null } = {
  status: 'local',
  userId: null,
};

/**
 * Every sync runs through this chain. Overlapping calls (login + a rapid vault
 * edit, or two components mutating at once) would otherwise race and push stale
 * snapshots on top of newer ones.
 */
let syncQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = syncQueue.then(task, task);
  syncQueue = result.catch(() => undefined);
  return result;
}

/** Resolves once every queued sync has settled. Exposed for tests. */
export function whenVaultSyncIdle(): Promise<void> {
  return syncQueue.then(
    () => undefined,
    () => undefined
  );
}

function isCurrentUser(userId: number): boolean {
  return authService.getUser()?.id === userId;
}

function setSyncState(userId: number | null, status: VaultSyncStatus, message?: string): void {
  syncState = { userId, status, message };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VAULT_SYNC_STATUS_EVENT));
  }
}

export function getVaultSyncState(): VaultSyncState {
  const userId = authService.getUser()?.id ?? null;
  if (userId === null) return { status: 'local' };
  if (syncState.userId !== userId) return { status: 'idle' };
  return { status: syncState.status, message: syncState.message };
}

function markReconciled(userId: number): void {
  setSyncState(userId, 'synced');
}

async function reconcileVault(userId: number): Promise<void> {
  if (!isCurrentUser(userId)) return;

  migrateLegacyVaultKeys();
  claimAnonymousVaultFor(userId);

  const scope: VaultScope = { userId };
  const remote = await fetchRemoteVault();

  if (!isCurrentUser(userId)) return;

  // Local mutations are synchronous and may happen while the remote request is
  // in flight. Re-read here so reconciliation never overwrites newer local work.
  const local = readAllVaults(scope);
  const merged = mergeVaultCards(local, remote, readTombstones(scope));

  if (vaultFingerprint(merged) !== vaultFingerprint(local)) {
    writeAllVaults(merged, scope);
    notifyVaultUpdated();
  }

  if (vaultFingerprint(merged) !== vaultFingerprint(remote)) {
    await pushVaultToRemote(merged, VAULT_GAMES);
  }

  if (isCurrentUser(userId)) {
    markReconciled(userId);
  }
}

/**
 * Reconciles the signed-in user's local vault with the server.
 *
 * Local and remote records are merged by their stable vault id rather than the
 * old "remote wins, overwrite everything" behaviour, and the push covers both
 * games at once so neither game's collection can be dropped.
 */
export async function syncVaultOnLogin(): Promise<void> {
  const user = authService.getUser();
  if (!user) return;
  const userId = user.id;
  setSyncState(userId, 'syncing');

  await enqueue(async () => {
    try {
      await reconcileVault(userId);
    } catch (error) {
      console.warn('Vault sync failed — using local data:', error);
      if (isCurrentUser(userId)) {
        setSyncState(userId, 'error', 'Cloud sync is unavailable. Changes remain saved locally.');
      }
    }
  });
}

/**
 * Pushes the full local vault (both games) for the signed-in user.
 *
 * Callers used to pass a single game's cards, which made the server delete the
 * other game's collection. The snapshot is always read from storage here so the
 * payload is complete and consistent.
 */
export async function syncVaultToServer(): Promise<void> {
  const user = authService.getUser();
  if (!user) return;
  const userId = user.id;

  await enqueue(async () => {
    try {
      if (isCurrentUser(userId)) {
        setSyncState(userId, 'syncing');
      }
      // Every mutation re-fetches before pushing. A long-lived tab therefore
      // merges changes made on another device instead of deleting them with a
      // stale full snapshot.
      await reconcileVault(userId);
    } catch (error) {
      console.warn('Failed to reconcile or sync vault to server:', error);
      if (isCurrentUser(userId)) {
        setSyncState(userId, 'error', 'Cloud sync is unavailable. Changes remain saved locally.');
      }
    }
  });
}

/** Fire-and-forget variant used by vault mutations. */
export function scheduleVaultSync(): void {
  if (!authService.getUser()) return;
  void syncVaultToServer();
}

/** Exposed for tests/diagnostics: the snapshot that would be pushed right now. */
export function currentVaultSnapshot(): VaultCard[] {
  return readAllVaults(getActiveScope());
}

export function resetVaultSyncForTests(): void {
  syncQueue = Promise.resolve();
  syncState = { status: 'local', userId: null };
}
