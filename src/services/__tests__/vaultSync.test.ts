import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PokemonCard, VaultCard } from '../../types/pokemon';

const server = vi.hoisted(() => {
  const collections = new Map<number, VaultCard[]>();
  const pushCalls: Array<{ userId: number | null; cards: VaultCard[]; games: string[] }> = [];
  const activity: string[] = [];
  let pushDelayMs = 0;
  let fetchDelayMs = 0;
  let activeFetches = 0;
  let maxConcurrentFetches = 0;

  const currentUserId = (): number | null => {
    try {
      const raw = localStorage.getItem('tcgtracker_user');
      return raw ? (JSON.parse(raw) as { id: number }).id : null;
    } catch {
      return null;
    }
  };

  return {
    collections,
    pushCalls,
    activity,
    currentUserId,
    setPushDelay: (ms: number) => {
      pushDelayMs = ms;
    },
    getPushDelay: () => pushDelayMs,
    setFetchDelay: (ms: number) => {
      fetchDelayMs = ms;
    },
    getFetchDelay: () => fetchDelayMs,
    beginFetch: () => {
      activeFetches += 1;
      maxConcurrentFetches = Math.max(maxConcurrentFetches, activeFetches);
    },
    endFetch: () => {
      activeFetches -= 1;
    },
    getMaxConcurrentFetches: () => maxConcurrentFetches,
    reset: () => {
      collections.clear();
      pushCalls.length = 0;
      activity.length = 0;
      pushDelayMs = 0;
      fetchDelayMs = 0;
      activeFetches = 0;
      maxConcurrentFetches = 0;
    },
  };
});

vi.mock('../portfolioApiService', () => ({
  fetchRemoteVault: vi.fn(async () => {
    const userId = server.currentUserId();
    if (userId === null) throw new Error('not authenticated');
    server.beginFetch();
    try {
      if (server.getFetchDelay() > 0) {
        await new Promise((resolve) => setTimeout(resolve, server.getFetchDelay()));
      }
      return JSON.parse(JSON.stringify(server.collections.get(userId) ?? [])) as VaultCard[];
    } finally {
      server.endFetch();
    }
  }),
  pushVaultToRemote: vi.fn(async (cards: VaultCard[], games: string[]) => {
    const userId = server.currentUserId();
    if (userId === null) throw new Error('not authenticated');
    server.activity.push(`start:${server.pushCalls.length}`);
    server.pushCalls.push({ userId, cards: JSON.parse(JSON.stringify(cards)), games });

    if (server.getPushDelay() > 0) {
      await new Promise((resolve) => setTimeout(resolve, server.getPushDelay()));
    }

    // Mirror the server contract: replace rows for the synced games only.
    const scoped = new Set(games);
    const existing = server.collections.get(userId) ?? [];
    const untouched = existing.filter((c) => !scoped.has(c.game ?? 'pokemon'));
    server.collections.set(userId, [
      ...untouched,
      ...JSON.parse(JSON.stringify(cards.filter((c) => scoped.has(c.game ?? 'pokemon')))),
    ]);
    server.activity.push(`end:${server.pushCalls.length - 1}`);
    return cards.length;
  }),
  isAuthenticatedForSync: vi.fn(() => server.currentUserId() !== null),
}));

import { fetchRemoteVault, pushVaultToRemote } from '../portfolioApiService';
import { vaultService } from '../vaultService';
import {
  getVaultSyncState,
  resetVaultSyncForTests,
  syncVaultOnLogin,
  syncVaultToServer,
  whenVaultSyncIdle,
} from '../vaultSyncService';
import {
  mergeVaultCards,
  readAllVaults,
  readVault,
  resetVaultStorageForTests,
  tombstoneStorageKey,
  vaultStorageKey,
} from '../vaultStorage';

const makeCard = (id: string, name: string): PokemonCard =>
  ({ id, name, marketPrice: 10 }) as unknown as PokemonCard;

const makeVaultCard = (
  id: string,
  game: 'pokemon' | 'onepiece',
  updatedAt: string,
  overrides: Partial<VaultCard> = {}
): VaultCard => ({
  id,
  card: makeCard(`card-${id}`, `Card ${id}`),
  purchasePrice: 5,
  purchaseDate: updatedAt,
  quantity: 1,
  condition: 'raw',
  game,
  updatedAt,
  ...overrides,
});

const signIn = (userId: number) => {
  localStorage.setItem(
    'tcgtracker_user',
    JSON.stringify({
      id: userId,
      username: `user${userId}`,
      email: `user${userId}@example.com`,
      created_at: '',
      updated_at: '',
    })
  );
};

const signOut = () => localStorage.removeItem('tcgtracker_user');

const idsFor = (cards: VaultCard[], game: string) =>
  cards
    .filter((c) => (c.game ?? 'pokemon') === game)
    .map((c) => c.id)
    .sort();

beforeEach(async () => {
  await whenVaultSyncIdle();
  localStorage.clear();
  resetVaultStorageForTests();
  resetVaultSyncForTests();
  server.reset();
  vi.mocked(fetchRemoteVault).mockClear();
  vi.mocked(pushVaultToRemote).mockClear();
});

describe('vault storage namespacing', () => {
  it('keeps anonymous data on the shared keys and account data on namespaced keys', () => {
    expect(vaultStorageKey('pokemon', { userId: null })).toBe('tcg_vault_cards_pokemon');
    expect(vaultStorageKey('onepiece', { userId: null })).toBe('tcg_vault_cards_onepiece');
    expect(vaultStorageKey('pokemon', { userId: 7 })).toBe('tcg_vault_cards_pokemon::user_7');
  });

  it('migrates the legacy single-game key once, without losing data', () => {
    const legacy = [makeVaultCard('legacy-1', 'pokemon', '2024-01-01T00:00:00.000Z')];
    localStorage.setItem('tcg_vault_cards', JSON.stringify(legacy));

    const cards = vaultService.getVaultCards('pokemon');

    expect(cards.map((c) => c.id)).toEqual(['legacy-1']);
    expect(cards[0].game).toBe('pokemon');
    expect(localStorage.getItem('tcg_vault_cards')).toBeNull();
    expect(localStorage.getItem('tcg_vault_legacy_migrated')).toBe('1');
    // Re-reading does not resurrect or duplicate anything.
    expect(vaultService.getVaultCards('pokemon').map((c) => c.id)).toEqual(['legacy-1']);
  });

  it('rejects malformed imports without replacing valid local data', () => {
    vaultService.addToVault(makeCard('existing', 'Existing'), 10, 1, 'raw');

    expect(() =>
      vaultService.importVault(
        JSON.stringify([
          {
            id: 'broken',
            card: { id: 'broken', name: 'Broken' },
            purchasePrice: 'not-a-number',
            purchaseDate: 'not-a-date',
            quantity: 0,
            condition: 'unknown',
          },
        ])
      )
    ).toThrow('Invalid vault data format');

    expect(vaultService.getVaultCards('pokemon').map((card) => card.card.id)).toEqual(['existing']);
  });

  it('restores a deleted card from an older export and clears its tombstone', async () => {
    signIn(1);
    vaultService.addToVault(makeCard('restore-me', 'Restore Me'), 10, 1, 'raw');
    await whenVaultSyncIdle();
    const exported = vaultService.exportVault('pokemon');
    const original = vaultService.getVaultCards('pokemon')[0];

    vaultService.removeFromVault(original.id, 'pokemon');
    await whenVaultSyncIdle();
    expect(server.collections.get(1) ?? []).toEqual([]);

    vaultService.importVault(exported, 'pokemon');
    await whenVaultSyncIdle();
    await syncVaultOnLogin();

    expect(vaultService.getVaultCards('pokemon').map((card) => card.card.id)).toEqual([
      'restore-me',
    ]);
    expect(server.collections.get(1)!.map((card) => card.card.id)).toEqual(['restore-me']);
  });
});

describe('Pokemon and One Piece coexistence', () => {
  it('does not delete the other game when saving locally', () => {
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    vaultService.addToVault(makeCard('op-1', 'Luffy'), 20, 1, 'raw', undefined, 'onepiece');

    expect(vaultService.getVaultCards('pokemon').map((c) => c.card.id)).toEqual(['pk-1']);
    expect(vaultService.getVaultCards('onepiece').map((c) => c.card.id)).toEqual(['op-1']);

    vaultService.addToVault(makeCard('pk-2', 'Charizard'), 30, 1, 'raw', undefined, 'pokemon');

    expect(vaultService.getVaultCards('onepiece').map((c) => c.card.id)).toEqual(['op-1']);
    expect(vaultService.getVaultCards('pokemon').map((c) => c.card.id)).toEqual(['pk-1', 'pk-2']);
  });

  it('pushes both games together so a per-game save cannot wipe the other', async () => {
    signIn(1);
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    await whenVaultSyncIdle();
    vaultService.addToVault(makeCard('op-1', 'Luffy'), 20, 1, 'raw', undefined, 'onepiece');
    await whenVaultSyncIdle();

    const lastPush = server.pushCalls[server.pushCalls.length - 1];
    expect(lastPush.games).toEqual(['pokemon', 'onepiece']);
    expect(idsFor(lastPush.cards, 'pokemon')).toHaveLength(1);
    expect(idsFor(lastPush.cards, 'onepiece')).toHaveLength(1);

    const stored = server.collections.get(1)!;
    expect(idsFor(stored, 'pokemon')).toHaveLength(1);
    expect(idsFor(stored, 'onepiece')).toHaveLength(1);
  });

  it('removes only the targeted game entry from the server snapshot', async () => {
    signIn(1);
    const pk = vaultService.addToVault(
      makeCard('pk-1', 'Pikachu'),
      10,
      1,
      'raw',
      undefined,
      'pokemon'
    );
    vaultService.addToVault(makeCard('op-1', 'Luffy'), 20, 1, 'raw', undefined, 'onepiece');
    await whenVaultSyncIdle();

    vaultService.removeFromVault(pk.id, 'pokemon');
    await whenVaultSyncIdle();

    const stored = server.collections.get(1)!;
    expect(idsFor(stored, 'pokemon')).toEqual([]);
    expect(idsFor(stored, 'onepiece')).toHaveLength(1);
  });
});

describe('account switching', () => {
  it('claims anonymous data for the first account only', async () => {
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    expect(readAllVaults({ userId: null })).toHaveLength(1);

    signIn(1);
    await syncVaultOnLogin();

    expect(readAllVaults({ userId: 1 }).map((c) => c.card.id)).toEqual(['pk-1']);
    expect(server.collections.get(1)).toHaveLength(1);

    signOut();
    signIn(2);
    await syncVaultOnLogin();

    // The second account must not inherit or upload the first user's cards.
    expect(readAllVaults({ userId: 2 })).toEqual([]);
    expect(server.collections.get(2) ?? []).toEqual([]);
    expect(server.pushCalls.filter((p) => p.userId === 2)).toEqual([]);
  });

  it('keeps each account\u2019s vault in its own namespace', async () => {
    signIn(1);
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    await whenVaultSyncIdle();

    signOut();
    signIn(2);
    vaultService.addToVault(makeCard('pk-2', 'Charizard'), 10, 1, 'raw', undefined, 'pokemon');
    await whenVaultSyncIdle();

    expect(readAllVaults({ userId: 1 }).map((c) => c.card.id)).toEqual(['pk-1']);
    expect(readAllVaults({ userId: 2 }).map((c) => c.card.id)).toEqual(['pk-2']);
    expect(server.collections.get(1)!.map((c) => c.card.id)).toEqual(['pk-1']);
    expect(server.collections.get(2)!.map((c) => c.card.id)).toEqual(['pk-2']);
  });

  it('preserves the anonymous vault for signed-out use', async () => {
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    signIn(1);
    await syncVaultOnLogin();
    signOut();

    expect(vaultService.getVaultCards('pokemon').map((c) => c.card.id)).toEqual(['pk-1']);
  });

  it('does not re-claim a stale anonymous snapshot on later logins', async () => {
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    signIn(1);
    await syncVaultOnLogin();

    const claimed = vaultService.getVaultCards('pokemon')[0];
    vaultService.removeFromVault(claimed.id, 'pokemon');
    await whenVaultSyncIdle();

    signOut();
    localStorage.removeItem(tombstoneStorageKey({ userId: 1 }));
    signIn(1);
    await syncVaultOnLogin();

    expect(readAllVaults({ userId: 1 })).toEqual([]);
    expect(server.collections.get(1) ?? []).toEqual([]);
  });
});

describe('conflict resolution', () => {
  it('merges by vault id and keeps the newest version instead of remote-wins', async () => {
    signIn(1);
    const scope = { userId: 1 };

    const localNewer = makeVaultCard('v-1', 'pokemon', '2024-06-01T00:00:00.000Z', { quantity: 4 });
    const localOnly = makeVaultCard('v-local', 'onepiece', '2024-06-01T00:00:00.000Z');
    localStorage.setItem(vaultStorageKey('pokemon', scope), JSON.stringify([localNewer]));
    localStorage.setItem(vaultStorageKey('onepiece', scope), JSON.stringify([localOnly]));

    server.collections.set(1, [
      makeVaultCard('v-1', 'pokemon', '2024-01-01T00:00:00.000Z', { quantity: 1 }),
      makeVaultCard('v-remote', 'pokemon', '2024-01-01T00:00:00.000Z'),
    ]);

    await syncVaultOnLogin();

    const merged = readAllVaults(scope);
    expect(merged.map((c) => c.id).sort()).toEqual(['v-1', 'v-local', 'v-remote']);
    expect(merged.find((c) => c.id === 'v-1')!.quantity).toBe(4);
    expect(
      server.collections
        .get(1)!
        .map((c) => c.id)
        .sort()
    ).toEqual(['v-1', 'v-local', 'v-remote']);
  });

  it('lets a newer remote version win over stale local data', async () => {
    signIn(1);
    const scope = { userId: 1 };
    localStorage.setItem(
      vaultStorageKey('pokemon', scope),
      JSON.stringify([makeVaultCard('v-1', 'pokemon', '2024-01-01T00:00:00.000Z', { quantity: 1 })])
    );
    server.collections.set(1, [
      makeVaultCard('v-1', 'pokemon', '2024-09-01T00:00:00.000Z', { quantity: 9 }),
    ]);

    await syncVaultOnLogin();

    expect(readVault('pokemon', scope)[0].quantity).toBe(9);
  });

  it('does not resurrect a locally deleted card', async () => {
    signIn(1);
    const removed = vaultService.addToVault(
      makeCard('pk-1', 'Pikachu'),
      10,
      1,
      'raw',
      undefined,
      'pokemon'
    );
    await whenVaultSyncIdle();

    vaultService.removeFromVault(removed.id, 'pokemon');
    await whenVaultSyncIdle();

    // A stale server copy comes back on the next login.
    server.collections.set(1, [makeVaultCard(removed.id, 'pokemon', '2000-01-01T00:00:00.000Z')]);
    await syncVaultOnLogin();

    expect(readAllVaults({ userId: 1 })).toEqual([]);
  });

  it('merges deterministically regardless of argument order', () => {
    const a = makeVaultCard('x', 'pokemon', '2024-05-01T00:00:00.000Z', { quantity: 2 });
    const b = makeVaultCard('x', 'pokemon', '2024-01-01T00:00:00.000Z', { quantity: 1 });

    expect(mergeVaultCards([a], [b])[0].quantity).toBe(2);
    expect(mergeVaultCards([b], [a])[0].quantity).toBe(2);
  });
});

describe('sync scheduling', () => {
  it('is idempotent when local and remote already agree', async () => {
    signIn(1);
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    await whenVaultSyncIdle();

    const pushesAfterAdd = server.pushCalls.length;

    await syncVaultOnLogin();
    await syncVaultOnLogin();

    expect(server.pushCalls.length).toBe(pushesAfterAdd);
    expect(server.collections.get(1)!.map((c) => c.card.id)).toEqual(['pk-1']);
  });

  it('serializes overlapping syncs', async () => {
    signIn(1);
    server.setPushDelay(10);

    const first = syncVaultToServer();
    const second = syncVaultToServer();
    const third = syncVaultToServer();
    await Promise.all([first, second, third]);

    expect(server.getMaxConcurrentFetches()).toBe(1);
  });

  it('merges a remote device addition before pushing a local mutation', async () => {
    signIn(1);
    vaultService.addToVault(makeCard('device-a-first', 'Device A First'), 10, 1, 'raw');
    await whenVaultSyncIdle();

    server.collections.set(1, [
      ...server.collections.get(1)!,
      makeVaultCard('device-b-card', 'pokemon', '2026-08-06T12:00:00.000Z'),
    ]);

    vaultService.addToVault(makeCard('device-a-second', 'Device A Second'), 10, 1, 'raw');
    await whenVaultSyncIdle();

    const cardIds = server.collections.get(1)!.map((card) => card.card.id);
    expect(cardIds).toEqual(
      expect.arrayContaining(['device-a-first', 'card-device-b-card', 'device-a-second'])
    );
  });

  it('never syncs while signed out', async () => {
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    await whenVaultSyncIdle();
    await syncVaultOnLogin();

    expect(pushVaultToRemote).not.toHaveBeenCalled();
    expect(fetchRemoteVault).not.toHaveBeenCalled();
  });

  it('keeps local data when the server is unreachable', async () => {
    signIn(1);
    vaultService.addToVault(makeCard('pk-1', 'Pikachu'), 10, 1, 'raw', undefined, 'pokemon');
    await whenVaultSyncIdle();

    vi.mocked(fetchRemoteVault).mockRejectedValueOnce(new Error('offline'));
    await expect(syncVaultOnLogin()).resolves.toBeUndefined();

    expect(vaultService.getVaultCards('pokemon').map((c) => c.card.id)).toEqual(['pk-1']);
    expect(getVaultSyncState()).toMatchObject({ status: 'error' });
  });

  it('reconciles before a mutation push after the initial login fetch fails', async () => {
    signIn(1);
    server.collections.set(1, [
      makeVaultCard('remote-existing', 'pokemon', '2024-01-01T00:00:00.000Z'),
    ]);
    vi.mocked(fetchRemoteVault).mockRejectedValueOnce(new Error('cold start'));

    await expect(syncVaultOnLogin()).resolves.toBeUndefined();

    vaultService.addToVault(makeCard('local-new', 'Local New'), 10, 1, 'raw', undefined, 'pokemon');
    await whenVaultSyncIdle();

    const reconciled = server.collections.get(1)!;
    expect(reconciled).toHaveLength(2);
    expect(reconciled.some((card) => card.id === 'remote-existing')).toBe(true);
    expect(reconciled.some((card) => card.card.id === 'local-new')).toBe(true);
  });

  it('preserves a local mutation made while login reconciliation is fetching', async () => {
    signIn(1);
    server.collections.set(1, [
      makeVaultCard('remote-existing', 'pokemon', '2024-01-01T00:00:00.000Z'),
    ]);
    server.setFetchDelay(25);

    const reconciliation = syncVaultOnLogin();
    await new Promise((resolve) => setTimeout(resolve, 5));
    vaultService.addToVault(
      makeCard('local-during-fetch', 'Local During Fetch'),
      10,
      1,
      'raw',
      undefined,
      'pokemon'
    );

    await reconciliation;
    await whenVaultSyncIdle();

    expect(readAllVaults({ userId: 1 }).some((card) => card.card.id === 'local-during-fetch')).toBe(
      true
    );
    expect(server.collections.get(1)!.some((card) => card.card.id === 'local-during-fetch')).toBe(
      true
    );
    expect(server.collections.get(1)!.some((card) => card.id === 'remote-existing')).toBe(true);
  });
});
