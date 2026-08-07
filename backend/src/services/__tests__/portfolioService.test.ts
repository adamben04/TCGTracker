import { Database } from 'sqlite3';
import { ensureUserCollectionsSchema } from '../../db/userCollectionsSchema';
import { allDbRows, runDb } from '../../utils/dbAsync';
import { PortfolioService, VaultSyncEntry } from '../portfolioService';

const LEGACY_TABLE_SQL = `
  CREATE TABLE user_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    card_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    purchase_price REAL,
    purchase_date DATETIME,
    condition TEXT,
    notes TEXT,
    card_data TEXT,
    client_vault_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, card_id, condition)
  )
`;

const entry = (
  id: string,
  game: 'pokemon' | 'onepiece',
  overrides: Partial<VaultSyncEntry> = {}
): VaultSyncEntry => ({
  id,
  card: { id: `card-${id}`, name: `Card ${id}`, marketPrice: 12 },
  purchasePrice: 5,
  purchaseDate: '2024-01-01T00:00:00.000Z',
  quantity: 1,
  condition: 'raw',
  game,
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

async function createUsersTable(db: Database) {
  await runDb(db, 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT)');
  await runDb(db, 'INSERT INTO users (id) VALUES (1), (2)');
}

function openDb(): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = new Database(':memory:', (err) => (err ? reject(err) : resolve(db)));
  });
}

function closeDb(db: Database): Promise<void> {
  return new Promise((resolve) => db.close(() => resolve()));
}

describe('PortfolioService vault sync', () => {
  let db: Database;
  let service: PortfolioService;

  beforeEach(async () => {
    db = await openDb();
    await createUsersTable(db);
    await ensureUserCollectionsSchema(db);
    service = new PortfolioService(db);
  });

  afterEach(async () => {
    await closeDb(db);
  });

  it('stores both games and never drops one when the other is synced', async () => {
    await service.syncVault(1, [entry('pk-1', 'pokemon'), entry('op-1', 'onepiece')], {
      games: ['pokemon', 'onepiece'],
    });

    let rows = await service.getCollection(1);
    expect(rows.map((r) => r.client_vault_id).sort()).toEqual(['op-1', 'pk-1']);

    // A Pokemon-only sync must leave the One Piece collection untouched.
    await service.syncVault(1, [entry('pk-2', 'pokemon')], { games: ['pokemon'] });

    rows = await service.getCollection(1);
    expect(rows.map((r) => r.client_vault_id).sort()).toEqual(['op-1', 'pk-2']);
    expect(rows.find((r) => r.client_vault_id === 'op-1')!.game).toBe('onepiece');
  });

  it('clears a single game when an empty scoped payload is sent', async () => {
    await service.syncVault(1, [entry('pk-1', 'pokemon'), entry('op-1', 'onepiece')], {
      games: ['pokemon', 'onepiece'],
    });

    await service.syncVault(1, [], { games: ['onepiece'] });

    const rows = await service.getCollection(1);
    expect(rows.map((r) => r.client_vault_id)).toEqual(['pk-1']);
  });

  it('merges by client vault id instead of delete-and-reinsert', async () => {
    await service.syncVault(1, [entry('pk-1', 'pokemon')], { games: ['pokemon'] });
    const [first] = await service.getCollection(1);

    await service.syncVault(
      1,
      [entry('pk-1', 'pokemon', { quantity: 6, updatedAt: '2024-05-01T00:00:00.000Z' })],
      { games: ['pokemon'] }
    );

    const rows = await service.getCollection(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].quantity).toBe(6);
    expect(rows[0].client_updated_at).toBe('2024-05-01T00:00:00.000Z');
  });

  it('ignores a stale update for an already newer row', async () => {
    await service.syncVault(
      1,
      [entry('pk-1', 'pokemon', { quantity: 9, updatedAt: '2024-05-01T00:00:00.000Z' })],
      { games: ['pokemon'] }
    );

    await service.syncVault(
      1,
      [entry('pk-1', 'pokemon', { quantity: 1, updatedAt: '2024-01-01T00:00:00.000Z' })],
      { games: ['pokemon'] }
    );

    const rows = await service.getCollection(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(9);
  });

  it('is idempotent for repeated identical payloads', async () => {
    const payload = [entry('pk-1', 'pokemon'), entry('op-1', 'onepiece')];

    const first = await service.syncVault(1, payload, { games: ['pokemon', 'onepiece'] });
    const second = await service.syncVault(1, payload, { games: ['pokemon', 'onepiece'] });
    const third = await service.syncVault(1, payload, { games: ['pokemon', 'onepiece'] });

    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(third.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(third).toHaveLength(2);
  });

  it('keeps multiple vault entries for the same card and condition', async () => {
    await service.syncVault(
      1,
      [
        entry('lot-a', 'pokemon', {
          card: { id: 'base1-4', name: 'Charizard' },
          purchasePrice: 100,
        }),
        entry('lot-b', 'pokemon', {
          card: { id: 'base1-4', name: 'Charizard' },
          purchasePrice: 250,
        }),
      ],
      { games: ['pokemon'] }
    );

    const rows = await service.getCollection(1);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.purchase_price).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      100, 250,
    ]);
  });

  it('never touches another user\u2019s collection', async () => {
    await service.syncVault(1, [entry('pk-1', 'pokemon')], { games: ['pokemon'] });
    await service.syncVault(2, [entry('pk-2', 'pokemon')], { games: ['pokemon'] });

    expect((await service.getCollection(1)).map((r) => r.client_vault_id)).toEqual(['pk-1']);
    expect((await service.getCollection(2)).map((r) => r.client_vault_id)).toEqual(['pk-2']);

    await service.syncVault(2, [], { games: ['pokemon', 'onepiece'] });

    expect((await service.getCollection(1)).map((r) => r.client_vault_id)).toEqual(['pk-1']);
    expect(await service.getCollection(2)).toEqual([]);
  });

  it('serializes overlapping syncs without transaction errors', async () => {
    const results = await Promise.all([
      service.syncVault(1, [entry('pk-1', 'pokemon')], { games: ['pokemon'] }),
      service.syncVault(1, [entry('pk-1', 'pokemon'), entry('pk-2', 'pokemon')], {
        games: ['pokemon'],
      }),
      service.syncVault(1, [entry('pk-1', 'pokemon'), entry('pk-2', 'pokemon')], {
        games: ['pokemon'],
      }),
    ]);

    expect(results).toHaveLength(3);
    const rows = await service.getCollection(1);
    expect(rows.map((r) => r.client_vault_id).sort()).toEqual(['pk-1', 'pk-2']);
  });

  it('preserves rows added through the manual collection API', async () => {
    await service.addToCollection(1, 'base1-4', 'Charizard', 2, 100, undefined, 'near-mint');
    await service.syncVault(1, [entry('pk-1', 'pokemon')], { games: ['pokemon', 'onepiece'] });

    const rows = await service.getCollection(1);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.client_vault_id === null && r.card_id === 'base1-4')).toBe(true);
  });

  it('upserts manual additions by client vault id when provided', async () => {
    const created = await service.addToCollection(
      1,
      'base1-4',
      'Charizard',
      1,
      100,
      undefined,
      'raw',
      undefined,
      undefined,
      'vault-1',
      'onepiece'
    );
    const updated = await service.addToCollection(
      1,
      'base1-4',
      'Charizard',
      5,
      120,
      undefined,
      'raw',
      undefined,
      undefined,
      'vault-1',
      'onepiece'
    );

    expect(updated.id).toBe(created.id);
    expect(updated.quantity).toBe(5);
    expect(updated.game).toBe('onepiece');
    expect(await service.getCollection(1)).toHaveLength(1);
  });

  it('atomically upserts concurrent additions with the same client vault id', async () => {
    await Promise.all([
      service.addToCollection(
        1,
        'base1-4',
        'Charizard',
        1,
        100,
        undefined,
        'raw',
        undefined,
        undefined,
        'vault-concurrent',
        'pokemon'
      ),
      service.addToCollection(
        1,
        'base1-4',
        'Charizard',
        2,
        110,
        undefined,
        'raw',
        undefined,
        undefined,
        'vault-concurrent',
        'pokemon'
      ),
    ]);

    const rows = await service.getCollection(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].client_vault_id).toBe('vault-concurrent');
    expect([1, 2]).toContain(rows[0].quantity);
  });

  it('filters the collection and stats by game', async () => {
    await service.syncVault(
      1,
      [entry('pk-1', 'pokemon', { quantity: 2 }), entry('op-1', 'onepiece', { quantity: 3 })],
      { games: ['pokemon', 'onepiece'] }
    );

    expect((await service.getCollection(1, 'onepiece')).map((r) => r.client_vault_id)).toEqual([
      'op-1',
    ]);
    expect((await service.getPortfolioStats(1, 'pokemon')).totalCards).toBe(2);
    expect((await service.getPortfolioStats(1)).totalCards).toBe(5);
  });
});

describe('user_collections schema migration', () => {
  it('rebuilds the legacy table without losing rows and recovers the game', async () => {
    const db = await openDb();
    await createUsersTable(db);
    await runDb(db, LEGACY_TABLE_SQL);
    await runDb(
      db,
      `INSERT INTO user_collections (user_id, card_id, card_name, quantity, purchase_price, condition, card_data, client_vault_id)
       VALUES (1, 'base1-4', 'Charizard', 2, 100, 'raw', ?, 'vault-1'),
              (1, 'op01-001', 'Luffy', 1, 50, 'raw', ?, 'vault-2'),
              (1, 'legacy-only', 'No Payload', 1, 10, 'raw', NULL, NULL)`,
      [
        JSON.stringify({ id: 'vault-1', game: 'pokemon' }),
        JSON.stringify({ id: 'vault-2', game: 'onepiece' }),
      ]
    );

    await ensureUserCollectionsSchema(db);

    const rows = await allDbRows<{ client_vault_id: string | null; game: string }>(
      db,
      'SELECT client_vault_id, game FROM user_collections ORDER BY id'
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.game)).toEqual(['pokemon', 'onepiece', 'pokemon']);

    const indexes = await allDbRows<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'user_collections'"
    );
    expect(indexes.map((i) => i.name)).toContain('idx_user_collections_client_vault');

    // The destructive UNIQUE(user_id, card_id, condition) constraint is gone.
    const service = new PortfolioService(db);
    await service.syncVault(
      1,
      [
        entry('vault-1', 'pokemon', { card: { id: 'base1-4', name: 'Charizard' } }),
        entry('vault-3', 'pokemon', { card: { id: 'base1-4', name: 'Charizard' } }),
      ],
      { games: ['pokemon'] }
    );
    const after = await service.getCollection(1);
    // vault-2 is a One Piece row so a Pokemon-scoped sync leaves it in place.
    expect(after.map((r) => r.client_vault_id).sort()).toEqual([
      null,
      'vault-1',
      'vault-2',
      'vault-3',
    ]);

    // Repeat runs are a no-op.
    await ensureUserCollectionsSchema(db);
    expect(await service.getCollection(1)).toHaveLength(4);

    await closeDb(db);
  });
});
