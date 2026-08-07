import { Database } from 'sqlite3';
import { ensureUserCollectionsSchema } from '../../db/userCollectionsSchema';
import { allDbRows, runDb } from '../../utils/dbAsync';
import { BinderService } from '../binderService';

const openDb = () =>
  new Promise<Database>((resolve, reject) => {
    const db = new Database(':memory:', (error) => (error ? reject(error) : resolve(db)));
  });

const closeDb = (db: Database) =>
  new Promise<void>((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });

describe('BinderService commitToVault', () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb();
    await runDb(db, 'PRAGMA foreign_keys = ON');
    await runDb(
      db,
      'CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, email TEXT, password_hash TEXT)'
    );
    await runDb(
      db,
      "INSERT INTO users (id, username, email, password_hash) VALUES (1, 'u', 'u@example.com', 'x')"
    );
    await ensureUserCollectionsSchema(db);
    await runDb(
      db,
      `CREATE TABLE binders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        game TEXT NOT NULL,
        pages INTEGER NOT NULL,
        slots_per_page INTEGER NOT NULL,
        theme_description TEXT,
        budget_cents INTEGER,
        constraints_json TEXT,
        total_cost_cents INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await runDb(
      db,
      `CREATE TABLE binder_slots (
        id INTEGER PRIMARY KEY,
        binder_id INTEGER NOT NULL,
        page_number INTEGER NOT NULL,
        slot_position INTEGER NOT NULL,
        card_id TEXT,
        card_snapshot TEXT,
        market_price_cents INTEGER,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await runDb(
      db,
      "INSERT INTO binders (id, user_id, name, game, pages, slots_per_page) VALUES (1, 1, 'One Piece', 'onepiece', 1, 9)"
    );
    await runDb(
      db,
      `INSERT INTO binder_slots
        (id, binder_id, page_number, slot_position, card_id, card_snapshot, market_price_cents)
       VALUES (1, 1, 1, 1, 'op-01', '{"name":"Luffy"}', 1250)`
    );
  });

  afterEach(async () => {
    await closeDb(db);
  });

  it('inserts once and increments quantity on a repeated commit', async () => {
    const service = new BinderService(db);

    await service.commitToVault(1, 1);
    await service.commitToVault(1, 1);

    const rows = await allDbRows<{ quantity: number; game: string }>(
      db,
      'SELECT quantity, game FROM user_collections WHERE user_id = 1'
    );
    expect(rows).toEqual([{ quantity: 2, game: 'onepiece' }]);
  });
});
